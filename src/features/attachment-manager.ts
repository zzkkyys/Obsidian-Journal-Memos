import { App, TFile, TFolder, normalizePath } from "obsidian";
import { computeBufferHash } from "../utils/hash";

interface AttachmentIndex {
    [hash: string]: string; // hash -> filePath
}

export class AttachmentManager {
    private app: App;
    private indexPath: string;
    private index: AttachmentIndex = {};
    private isLoaded = false;

    constructor(app: App, pluginDir: string) {
        this.app = app;
        this.indexPath = normalizePath(`${pluginDir}/attachment-index.json`);
    }

    async loadIndex(): Promise<void> {
        if (this.isLoaded) return;

        try {
            const exists = await this.app.vault.adapter.exists(this.indexPath);
            if (exists) {
                const content = await this.app.vault.adapter.read(this.indexPath);
                this.index = JSON.parse(content);
            }
        } catch (error) {
            console.error("Failed to load attachment index:", error);
            this.index = {};
        }

        this.isLoaded = true;
    }

    async saveIndex(): Promise<void> {
        try {
            await this.app.vault.adapter.write(this.indexPath, JSON.stringify(this.index, null, 2));
        } catch (error) {
            console.error("Failed to save attachment index:", error);
        }
    }

    async getDuplicatePath(buffer: ArrayBuffer): Promise<string | null> {
        if (!this.isLoaded) await this.loadIndex();

        const hash = await computeBufferHash(buffer);
        const existingPath = this.index[hash];

        if (existingPath) {
            // Verify file still exists
            const file = this.app.vault.getAbstractFileByPath(existingPath);
            if (file instanceof TFile) {
                return existingPath;
            } else {
                // File missing, remove from index
                delete this.index[hash];
                await this.saveIndex();
            }
        }

        return null;
    }

    async addFile(path: string, buffer: ArrayBuffer): Promise<void> {
        if (!this.isLoaded) await this.loadIndex();

        const hash = await computeBufferHash(buffer);
        this.index[hash] = path;
        await this.saveIndex();
    }

    async scanFolder(folderPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) {
            return;
        }

        const files = folder.children;
        for (const file of files) {
            if (file instanceof TFile) {
                // Check if it's an image or common attachment type
                const ext = file.extension.toLowerCase();
                if (["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "pdf"].includes(ext)) {
                    try {
                        const buffer = await this.app.vault.readBinary(file);
                        const hash = await computeBufferHash(buffer);
                        this.index[hash] = file.path;
                    } catch (e) {
                        console.error(`Failed to index file ${file.path}:`, e);
                    }
                }
            } else if (file instanceof TFolder) {
                await this.scanFolder(file.path);
            }
        }
    }

    async rebuildIndex(rootPath: string): Promise<void> {
        this.index = {};
        await this.scanFolder(rootPath);
        await this.saveIndex();
        console.log("Attachment index rebuilt.");
    }
}
