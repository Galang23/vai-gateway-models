import argparse
import json
from collections import Counter


def load_models(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return payload["data"]

    if isinstance(payload, list):
        return payload

    raise ValueError("Unsupported JSON format. Expected { data: [...] } or [...].")


def first_model_id(models, predicate):
    for model in models:
        if predicate(model):
            return model.get("id", "unknown")
    return "-"


def summarize_schema(models):
    top_level_keys = set()
    pricing_key_counter = Counter()
    models_by_type = Counter()

    tier_examples = {}
    variant_examples = {}

    tier_keys = {
        "input_tiers",
        "output_tiers",
        "input_cache_read_tiers",
        "input_cache_write_tiers",
    }
    variant_keys = {
        "image_dimension_quality_pricing",
        "video_duration_pricing",
    }

    for model in models:
        top_level_keys.update(model.keys())
        models_by_type[model.get("type", "unknown")] += 1

        pricing = model.get("pricing") or {}
        if not isinstance(pricing, dict):
            continue

        for key in pricing.keys():
            pricing_key_counter[key] += 1

        for key in tier_keys:
            if key in pricing and isinstance(pricing[key], list) and pricing[key]:
                tier_examples.setdefault(key, model.get("id", "unknown"))

        for key in variant_keys:
            if key in pricing and isinstance(pricing[key], list) and pricing[key]:
                variant_examples.setdefault(key, model.get("id", "unknown"))

    return {
        "top_level_keys": sorted(top_level_keys),
        "pricing_key_counter": pricing_key_counter,
        "models_by_type": models_by_type,
        "tier_examples": tier_examples,
        "variant_examples": variant_examples,
    }


def print_report(models, summary):
    print("--- Pricing Schema Analysis ---")
    print(f"Total models scanned: {len(models)}")

    print("\n--- Models by Type ---")
    for model_type, count in sorted(summary["models_by_type"].items()):
        print(f"- {model_type}: {count}")

    print("\n--- Unique Pricing Keys (with model counts) ---")
    for key, count in sorted(summary["pricing_key_counter"].items()):
        print(f"- {key}: {count}")

    print("\n--- Tiered Pricing Keys (example model) ---")
    if summary["tier_examples"]:
        for key, model_id in sorted(summary["tier_examples"].items()):
            print(f"- {key}: {model_id}")
    else:
        print("- none")

    print("\n--- Variant Pricing Keys (example model) ---")
    if summary["variant_examples"]:
        for key, model_id in sorted(summary["variant_examples"].items()):
            print(f"- {key}: {model_id}")
    else:
        print("- none")

    has_video_pricing = first_model_id(
        models,
        lambda m: isinstance(m.get("pricing"), dict)
        and isinstance(m["pricing"].get("video_duration_pricing"), list)
        and len(m["pricing"]["video_duration_pricing"]) > 0,
    )
    has_image_variants = first_model_id(
        models,
        lambda m: isinstance(m.get("pricing"), dict)
        and isinstance(m["pricing"].get("image_dimension_quality_pricing"), list)
        and len(m["pricing"]["image_dimension_quality_pricing"]) > 0,
    )

    print("\n--- New Schema Signals ---")
    print(
        f"- video_duration_pricing present: {'yes' if has_video_pricing != '-' else 'no'} ({has_video_pricing})"
    )
    print(
        f"- image_dimension_quality_pricing present: {'yes' if has_image_variants != '-' else 'no'} ({has_image_variants})"
    )

    print("\n--- Top Level Keys ---")
    print(", ".join(summary["top_level_keys"]))


def main():
    parser = argparse.ArgumentParser(description="Analyze AI model pricing schema.")
    parser.add_argument(
        "--file",
        default="./pricing.json",
        help="Path to pricing JSON file (default: ./pricing.json)",
    )
    args = parser.parse_args()

    try:
        models = load_models(args.file)
        summary = summarize_schema(models)
        print_report(models, summary)
    except json.JSONDecodeError as e:
        print(f"JSON Decode Error: {e}")
    except FileNotFoundError:
        print(f"File not found: {args.file}")
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
