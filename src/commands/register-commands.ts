import { Editor, Notice } from "obsidian";
import type JournalMemosPlugin from "../main";

async function appendSelection(plugin: JournalMemosPlugin, editor: Editor): Promise<void> {
	const selection = editor.getSelection().trim();
	if (!selection) {
		new Notice("Select text before appending a memo.");
		return;
	}

	await plugin.memoService.appendMemo(selection);
	await plugin.refreshOpenViews();
	new Notice("Memo appended to today's daily note.");
}

export function registerCommands(plugin: JournalMemosPlugin): void {
	plugin.addCommand({
		id: "open-journal-memos-view",
		name: "Open memos view",
		callback: () => {
			void plugin.activateView();
		},
	});

	plugin.addCommand({
		id: "append-selection-as-journal-memo",
		name: "Append selection as memo",
		editorCallback: (editor) => {
			void appendSelection(plugin, editor);
		},
	});
}
