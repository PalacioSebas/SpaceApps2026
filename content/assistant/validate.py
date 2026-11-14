"""Verifica el paquete de contenido sin importar la app ni consultar servicios."""

import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
TOKEN = re.compile(r"\{\{([a-z][a-z0-9_]*)\}\}")
ID = re.compile(r"^[a-z][a-z0-9_]*$")
KINDS = {"official_reference", "product_contract", "context_snapshot"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read(name):
    with (ROOT / name).open(encoding="utf-8") as stream:
        document = json.load(stream)
    require(document.get("schema_version") == 1, f"{name}: versión no reconocida")
    return document


def index(items, label):
    result = {}
    require(isinstance(items, list) and items, f"{label}: lista vacía o inválida")
    for item in items:
        key = item.get("id")
        require(isinstance(key, str) and ID.fullmatch(key), f"{label}: ID inválido {key!r}")
        require(key not in result, f"{label}: ID duplicado {key}")
        result[key] = item
    return result


def references(ids, available, label):
    require(isinstance(ids, list), f"{label}: se esperaba una lista")
    require(all(isinstance(key, str) for key in ids), f"{label}: referencia no textual")
    require(len(ids) == len(set(ids)), f"{label}: referencias duplicadas")
    for key in ids:
        require(key in available, f"{label}: referencia desconocida {key}")


def validate_package():
    catalog = read("catalog.json")
    source_document = read("sources.json")
    demo = read("demo-scenarios.json")
    require(catalog.get("locale") == demo.get("locale") == "es-AR", "Idioma inconsistente")
    require(catalog.get("integration_status") == "portable_content_not_connected", "Revisar el estado de integración")
    states = catalog["context_contract"]["states"]
    values = catalog["context_contract"]["values"]
    require(not set(states).intersection(values), "Estados y valores tienen nombres superpuestos")
    for name, options in states.items():
        require(isinstance(options, list) and options, f"Estado inválido: {name}")
        require(len(options) == len(set(options)), f"Valores repetidos en {name}")

    sources = index(source_document["sources"], "Fuentes")
    actions = index(catalog["actions"], "Acciones")
    entries = index(catalog["entries"], "Respuestas")
    scenarios = index(demo["scenarios"], "Recorridos")

    for key, source in sources.items():
        require(source.get("kind") in KINDS, f"{key}: tipo de fuente inválido")
        require(source.get("title") and source.get("supports"), f"{key}: fuente sin alcance")
        if source["kind"] == "official_reference":
            parsed = urlparse(source.get("url", ""))
            require(parsed.scheme == "https" and parsed.hostname in {
                "science.nasa.gov", "irsa.ipac.caltech.edu", "caltech-ipac.github.io"
            }, f"{key}: revisar la referencia oficial")
            require(re.fullmatch(r"\d{4}-\d{2}-\d{2}", source.get("reviewed_on", "")), f"{key}: falta fecha de revisión")
            require(source.get("does_not_support"), f"{key}: falta el límite de la referencia")
        if source["kind"] == "product_contract":
            relative = source.get("document", "").split("#", 1)[0]
            path = (ROOT / relative).resolve()
            require(path.is_relative_to(ROOT) and path.is_file(), f"{key}: documento no portable")
            require(source.get("integration_review_required") is True, f"{key}: falta revisión de integración")
        if source["kind"] == "context_snapshot":
            references(source.get("context_fields"), values, f"{key}.context_fields")

    for key, action in actions.items():
        require(action.get("label"), f"{key}: acción sin rótulo")
        require(action.get("effect") in {"navigation", "proposal_only"}, f"{key}: efecto fuera del alcance")
        require(action.get("requires_explicit_click") is True, f"{key}: falta interacción explícita")

    for key, entry in entries.items():
        require(entry.get("topic") and entry.get("questions"), f"{key}: falta tema o preguntas")
        require(all(isinstance(q, str) and q.strip() for q in entry["questions"]), f"{key}: pregunta vacía")
        require(type(entry.get("priority")) is int, f"{key}: prioridad inválida")
        references(entry["requires"], values, f"{key}.requires")
        references(entry["source_ids"], sources, f"{key}.source_ids")
        references(entry["action_ids"], actions, f"{key}.action_ids")
        references(entry["follow_up_ids"], entries, f"{key}.follow_up_ids")
        references(entry["fallback_ids"], entries, f"{key}.fallback_ids")
        require(entry["source_ids"], f"{key}: respuesta sin fuentes")
        for state, options in entry["when"].items():
            require(state in states, f"{key}: condición desconocida {state}")
            require(isinstance(options, list) and options, f"{key}: condición vacía")
            require(all(option in states[state] for option in options), f"{key}: valor de condición inválido")
        used = set()
        require(set(entry["answers"]) == {"simple", "technical"}, f"{key}: faltan estilos de respuesta")
        for style, answer in entry["answers"].items():
            for field in ("summary", "detail"):
                text = answer.get(field)
                require(isinstance(text, str) and text.strip(), f"{key}.{style}.{field}: texto vacío")
                require(len(answer["summary"]) <= 320, f"{key}.{style}: resumen demasiado extenso")
                used.update(TOKEN.findall(text))
                require("{{" not in TOKEN.sub("", text) and "}}" not in TOKEN.sub("", text), f"{key}: variable mal formada")
        require(used == set(entry["requires"]), f"{key}: variables y requisitos no coinciden ({sorted(used)})")

    def walk_fallbacks(key, path):
        require(key not in path, f"Ciclo de alternativas: {' -> '.join((*path, key))}")
        for target in entries[key]["fallback_ids"]:
            walk_fallbacks(target, (*path, key))

    for key in entries:
        walk_fallbacks(key, ())

    require(len(scenarios) == 3, "Se esperan tres recorridos de presentación")
    for key, scenario in scenarios.items():
        require(scenario.get("title") and scenario.get("goal") and scenario.get("success"), f"{key}: recorrido incompleto")
        require(scenario.get("preflight") and scenario.get("contingencies"), f"{key}: faltan preparación o alternativas")
        steps = index(scenario["steps"], f"{key}.steps")
        for step_id, step in steps.items():
            label = f"{key}.{step_id}"
            require(step.get("instruction") and step.get("check"), f"{label}: paso sin instrucción o verificación")
            expected = step.get("expected_entry_ids", [])
            references(expected, entries, label)
            require(expected, f"{label}: falta respuesta esperada")
            if "action_id" in step:
                require(step["action_id"] in actions, f"{label}: acción desconocida")
                require(any(step["action_id"] in entries[entry]["action_ids"] for entry in expected), f"{label}: acción no vinculada a sus respuestas")
        for contingency in scenario["contingencies"]:
            require(contingency.get("if") and contingency.get("do"), f"{key}: alternativa incompleta")

    return {"entries": len(entries), "sources": len(sources), "scenarios": len(scenarios)}


if __name__ == "__main__":
    try:
        result = validate_package()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Contenido inválido: {error}", file=sys.stderr)
        sys.exit(1)
    print(f"Contenido válido: {result['entries']} respuestas, {result['sources']} fuentes y {result['scenarios']} recorridos.")
