// Lightweight editing helpers for the plain-textarea YAML editors. No heavy
// Prettier/CodeMirror bundle — just predictive auto-indent on Enter, Tab
// indent/outdent, and an on-demand pretty-print via the `yaml` dependency.
import YAML from "yaml";

/** Insert text at the caret, keeping native undo and firing an `input` event. */
function insertAtCaret(ta: HTMLTextAreaElement, text: string) {
  ta.focus();
  // execCommand is deprecated but is the only path that preserves the textarea
  // undo stack; fall back to setRangeText + a manual input event otherwise.
  if (!document.execCommand("insertText", false, text)) {
    const { selectionStart: s, selectionEnd: e } = ta;
    ta.setRangeText(text, s, e, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * Decide what an Enter press should do, given the text from the line start to
 * the caret. Pure (DOM-free) so it can be unit-tested. `replaceLine` means the
 * current partial line should be replaced by `text` (used to clear an empty
 * bullet); otherwise `text` is inserted at the caret. Behaviour:
 *   - scalar bullet (`- text`)       → new `- ` at the same indent (continue list)
 *   - empty bullet (`-`)             → clear it and break out of the list
 *   - mapping item (`- key: value`)  → indent under the dash for the next property
 *   - block opener (`key:`)          → indent one level deeper
 *   - otherwise                      → keep the current indent
 */
export function computeEnterEdit(line: string): { replaceLine: boolean; text: string } {
  const indent = (line.match(/^ */) as RegExpMatchArray)[0];
  const trimmed = line.trim();

  if (trimmed === "-") {
    return { replaceLine: true, text: indent + "\n" + indent };
  }

  const afterDash = trimmed.startsWith("- ") ? trimmed.slice(2) : null;
  const isMappingItem = afterDash != null && /^[\w.$-]+:(\s|$)/.test(afterDash);
  if (afterDash != null && !isMappingItem) {
    return { replaceLine: false, text: "\n" + indent + "- " };
  }

  const deeper = /:\s*$/.test(trimmed) || isMappingItem;
  return { replaceLine: false, text: "\n" + indent + (deeper ? "  " : "") };
}

/**
 * Key handling for a YAML textarea. Returns true if the event was handled (the
 * caller should then stop). Enter is resolved by `computeEnterEdit` (auto-indent
 * + bullet-list continuation). Tab inserts two spaces; ⇧+Tab removes up to two
 * leading spaces on the caret's line.
 */
export function handleYamlKeydown(e: KeyboardEvent): boolean {
  const ta = e.currentTarget as HTMLTextAreaElement;

  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const { selectionStart: s, value } = ta;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const { replaceLine, text } = computeEnterEdit(value.slice(lineStart, s));
    e.preventDefault();
    if (replaceLine) ta.setSelectionRange(lineStart, s);
    insertAtCaret(ta, text);
    return true;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    if (e.shiftKey) {
      const { selectionStart: s, value } = ta;
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const remove = (value.slice(lineStart).match(/^ {1,2}/)?.[0] ?? "").length;
      if (remove) {
        ta.setSelectionRange(lineStart, lineStart + remove);
        insertAtCaret(ta, "");
      }
    } else {
      insertAtCaret(ta, "  ");
    }
    return true;
  }

  return false;
}

/** Pretty-print YAML by round-tripping through the parser. Null if invalid. */
export function formatYaml(text: string): string | null {
  try {
    const doc = YAML.parse(text);
    if (doc == null) return null;
    return YAML.stringify(doc, { lineWidth: 0, indent: 2 });
  } catch {
    return null;
  }
}
