import json
import os

file_path = (
    "/home/adhi/.local/share/opencode/tool-output/tool_ba7e7a629001u0YUc6A6uwmxub"
)

try:
    with open(file_path, "r") as f:
        content = f.read()
        # The file content seems to start with "00001| ", we might need to clean it if it was a raw dump from a tool,
        # but the `read` output showed it just as text. However, looking at the `read` output again:
        # "00001| {"object":"list","data":..."
        # It seems the `read` tool adds line numbers "00001| ".
        # But wait, the `read` tool *output* in the conversation shows "00001| ", but the *actual file* might not have it if it was just read by the tool.
        # Actually, the previous tool output was `read` tool *displaying* the file content.
        # The prompt says: "This file contains a JSON response."
        # Usually tool output files are raw. The "00001| " is likely an artifact of the `read` tool's presentation in the chat, NOT the file content itself.
        # I will assume the file contains valid JSON.

        # If the read output actually meant the file starts with that, I'd need to handle it.
        # But standard `read` tool behavior formats output with line numbers.
        # I will assume raw JSON.
        pass

    with open(file_path, "r") as f:
        data = json.load(f)

    if not isinstance(data, dict) or "data" not in data:
        print("Error: JSON structure is not as expected (missing 'data' list).")
        exit(1)

    all_pricing_keys = set()
    special_keys_found = {}  # Key -> Example Model ID
    top_level_keys = set()

    keywords = ["web", "search", "cache", "read", "write", "image"]

    for model in data["data"]:
        # Top level keys
        for k in model.keys():
            top_level_keys.add(k)

        # Pricing keys
        if "pricing" in model:
            p_keys = model["pricing"].keys()
            for k in p_keys:
                all_pricing_keys.add(k)

                # Check for keywords in pricing keys
                for keyword in keywords:
                    if keyword in k.lower():
                        if k not in special_keys_found:
                            special_keys_found[k] = model.get("id", "unknown")

        # Check for keywords in top level keys too, just in case
        for k in model.keys():
            if k != "pricing":
                for keyword in keywords:
                    if keyword in k.lower():
                        if k not in special_keys_found:
                            special_keys_found[k] = model.get("id", "unknown")

    print("--- Analysis Summary ---")
    print(f"Total models scanned: {len(data['data'])}")
    print("\n--- All Unique Pricing Keys Found ---")
    for k in sorted(list(all_pricing_keys)):
        print(f"- {k}")

    print("\n--- Relevant/Special Keys Found (Example Model) ---")
    if special_keys_found:
        for k, example in special_keys_found.items():
            print(f"- {k}: (e.g., {example})")
    else:
        print(
            "No specific keys matching 'web search', 'cache', 'read', 'write', 'image' found."
        )

    print("\n--- All Top Level Keys ---")
    print(", ".join(sorted(list(top_level_keys))))

except json.JSONDecodeError as e:
    print(f"JSON Decode Error: {e}")
    # Fallback: print start of file to debug
    with open(file_path, "r") as f:
        print(f"File start: {f.read(100)}")
except Exception as e:
    print(f"An error occurred: {e}")
