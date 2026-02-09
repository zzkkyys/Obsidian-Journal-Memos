import { App, Modal, Setting } from "obsidian";

export type DuplicateAction = "use_existing" | "create_new" | "skip";

export class DuplicateFileModal extends Modal {
    private resolve: (action: DuplicateAction) => void;
    private fileName: string;
    private existingPath: string;
    private resolved = false;
    private matchType: "name_conflict" | "content_match";

    constructor(
        app: App,
        fileName: string,
        existingPath: string,
        matchType: "name_conflict" | "content_match",
        onClose: (action: DuplicateAction) => void,
    ) {
        super(app);
        this.fileName = fileName;
        this.existingPath = existingPath;
        this.matchType = matchType;
        this.resolve = onClose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Duplicate Attachment Detected" });

        if (this.matchType === "content_match") {
            contentEl.createEl("p", {
                text: `The file "${this.fileName}" has the exact same content as an existing file at "${this.existingPath}".`,
            });
        } else {
            contentEl.createEl("p", {
                text: `A file named "${this.fileName}" already exists at "${this.existingPath}".`,
            });
        }
        contentEl.createEl("p", {
            text: "What would you like to do?",
        });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Use Existing")
                    .setTooltip("Link to the existing file without uploading a new one")
                    .onClick(() => {
                        this.resolved = true;
                        this.resolve("use_existing");
                        this.close();
                    }),
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Create Copy")
                    .setTooltip("Upload as a new file (auto-renamed)")
                    .onClick(() => {
                        this.resolved = true;
                        this.resolve("create_new");
                        this.close();
                    }),
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Skip")
                    .setWarning()
                    .onClick(() => {
                        this.resolved = true;
                        this.resolve("skip");
                        this.close();
                    }),
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (!this.resolved) {
            this.resolve("skip");
        }
    }
}
