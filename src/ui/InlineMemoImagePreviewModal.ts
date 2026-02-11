import { App, MarkdownRenderChild, MarkdownRenderer, Modal } from "obsidian";

const PREVIEW_SCALE_MIN = 0.5;
const PREVIEW_SCALE_MAX = 4;
const PREVIEW_SCALE_STEP = 0.2;

export interface InlineMemoPreviewItem {
    key: string;
    name: string;
    sourcePath: string;
    markdown: string;
    imageSrc: string;
}

export class InlineMemoImagePreviewModal extends Modal {
    private readonly allItems: InlineMemoPreviewItem[];
    private items: InlineMemoPreviewItem[] = [];
    private index: number;
    private readonly currentSourcePath: string;
    private onlyCurrentSource = true;
    private scale = 1;
    private offsetX = 0;
    private offsetY = 0;
    private panEnabled = true;
    private dragPointerId: number | null = null;
    private dragStartX = 0;
    private dragStartY = 0;
    private dragOriginX = 0;
    private dragOriginY = 0;
    private readonly disposeFns: Array<() => void> = [];
    private renderChild: MarkdownRenderChild | null = null;
    private titleTextEl: HTMLElement | null = null;
    private scopeButtonEl: HTMLButtonElement | null = null;
    private contentAreaEl: HTMLElement | null = null;
    private counterEl: HTMLElement | null = null;
    private prevButtonEl: HTMLButtonElement | null = null;
    private nextButtonEl: HTMLButtonElement | null = null;
    private zoomOutButtonEl: HTMLButtonElement | null = null;
    private zoomInButtonEl: HTMLButtonElement | null = null;
    private panButtonEl: HTMLButtonElement | null = null;

    constructor(app: App, items: InlineMemoPreviewItem[], targetItem: InlineMemoPreviewItem) {
        super(app);
        this.allItems = items.length > 0 ? items : [targetItem];
        this.currentSourcePath = targetItem.sourcePath;
        this.index = 0;
        this.applyScope(true, targetItem);
    }

    onOpen(): void {
        this.modalEl.addClass("jm-inline-image-preview-modal");
        this.contentEl.empty();
        this.buildLayout();
        void this.renderCurrentItem();
        this.registerListener(window, "keydown", this.handleKeydown);
    }

    onClose(): void {
        this.modalEl.removeClass("jm-inline-image-preview-modal");
        for (const dispose of this.disposeFns) {
            dispose();
        }
        this.disposeFns.length = 0;
        this.renderChild?.unload();
        this.renderChild = null;
        this.contentEl.empty();
        this.dragPointerId = null;
    }

    private buildLayout(): void {
        const modalRoot = this.contentEl.createDiv({ cls: "jm-preview-modal" });
        const headerEl = modalRoot.createDiv({ cls: "jm-preview-header" });
        this.titleTextEl = headerEl.createEl("h4");
        const headerActionsEl = headerEl.createDiv({ cls: "jm-preview-header-actions" });
        this.scopeButtonEl = this.createIconButton(
            headerActionsEl,
            "Only current file",
            `<path d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6"></path><circle cx="12" cy="12" r="2.5"></circle>`,
            () => this.toggleScope(),
        );
        this.scopeButtonEl.classList.add("is-active");

        this.contentAreaEl = modalRoot.createDiv({ cls: "jm-preview-content is-image is-pan-enabled" });
        this.registerListener(this.contentAreaEl, "pointerdown", this.handlePointerDown);
        this.registerListener(this.contentAreaEl, "pointermove", this.handlePointerMove);
        this.registerListener(this.contentAreaEl, "pointerup", this.handlePointerUp);
        this.registerListener(this.contentAreaEl, "pointercancel", this.handlePointerUp);

        const footerEl = modalRoot.createDiv({ cls: "jm-preview-footer" });
        this.counterEl = footerEl.createSpan({ cls: "jm-preview-counter" });
        const actionsEl = footerEl.createDiv({ cls: "jm-preview-actions" });

        this.prevButtonEl = this.createIconButton(
            actionsEl,
            "Previous image",
            `<path d="m15 18-6-6 6-6"></path>`,
            () => this.goPrevious(),
        );
        this.nextButtonEl = this.createIconButton(
            actionsEl,
            "Next image",
            `<path d="m9 18 6-6-6-6"></path>`,
            () => this.goNext(),
        );
        this.zoomOutButtonEl = this.createIconButton(
            actionsEl,
            "Zoom out",
            `<path d="M5 12h14"></path>`,
            () => this.zoomOut(),
        );
        this.zoomInButtonEl = this.createIconButton(
            actionsEl,
            "Zoom in",
            `<path d="M5 12h14"></path><path d="M12 5v14"></path>`,
            () => this.zoomIn(),
        );
        this.panButtonEl = this.createIconButton(
            actionsEl,
            "Toggle drag mode",
            `<path d="M7 12V6a1 1 0 0 1 2 0v6"></path><path d="M11 12V5a1 1 0 0 1 2 0v7"></path><path d="M15 12V7a1 1 0 0 1 2 0v8"></path><path d="M19 12v-2a1 1 0 0 1 2 0v6a5 5 0 0 1-5 5h-4a5 5 0 0 1-4.2-2.3l-2.2-3.3a1 1 0 0 1 1.5-1.3L9 16v-4"></path>`,
            () => this.togglePanMode(),
        );
        this.createIconButton(
            actionsEl,
            "Close preview",
            `<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>`,
            () => this.close(),
        );
    }

    private createIconButton(
        container: HTMLElement,
        label: string,
        pathsMarkup: string,
        onClick: () => void,
    ): HTMLButtonElement {
        const buttonEl = container.createEl("button", {
            cls: "jm-icon-button jm-preview-icon-btn",
            attr: {
                type: "button",
                "aria-label": label,
                title: label,
            },
        });
        const svgEl = buttonEl.createSvg("svg", {
            attr: {
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                "stroke-width": "2",
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
            },
        });
        svgEl.innerHTML = pathsMarkup;
        this.registerListener(buttonEl, "click", (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
        return buttonEl;
    }

    private registerListener(
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        target.addEventListener(type, listener, options);
        this.disposeFns.push(() => target.removeEventListener(type, listener, options));
    }

    private get currentItem(): InlineMemoPreviewItem | null {
        if (this.items.length === 0) {
            return null;
        }
        return this.items[this.index] ?? null;
    }

    private hasAlternativeScope(): boolean {
        if (!this.currentSourcePath) {
            return false;
        }
        return this.allItems.some((item) => item.sourcePath !== this.currentSourcePath);
    }

    private updateScopeButtonState(): void {
        if (!this.scopeButtonEl) {
            return;
        }
        this.scopeButtonEl.disabled = !this.hasAlternativeScope();
        this.scopeButtonEl.classList.toggle("is-active", this.onlyCurrentSource);
        this.scopeButtonEl.setAttribute(
            "title",
            this.onlyCurrentSource ? "Only current file" : "Show all files in this view",
        );
    }

    private findItemIndex(items: InlineMemoPreviewItem[], targetItem: InlineMemoPreviewItem): number {
        let index = items.findIndex(
            (item) => item.key === targetItem.key && item.sourcePath === targetItem.sourcePath,
        );
        if (index >= 0) {
            return index;
        }
        index = items.findIndex((item) => item.key === targetItem.key);
        return index;
    }

    private applyScope(onlyCurrentSource: boolean, targetItem?: InlineMemoPreviewItem): void {
        const shouldFilterBySource = onlyCurrentSource && Boolean(this.currentSourcePath);
        this.onlyCurrentSource = shouldFilterBySource;
        if (shouldFilterBySource) {
            this.items = this.allItems.filter((item) => item.sourcePath === this.currentSourcePath);
        } else {
            this.items = [...this.allItems];
        }
        if (this.items.length === 0) {
            this.items = [...this.allItems];
            this.onlyCurrentSource = false;
        }

        if (targetItem) {
            const targetIndex = this.findItemIndex(this.items, targetItem);
            if (targetIndex >= 0) {
                this.index = targetIndex;
            } else {
                this.index = Math.min(this.index, Math.max(this.items.length - 1, 0));
            }
        } else {
            this.index = Math.min(this.index, Math.max(this.items.length - 1, 0));
        }

        this.updateScopeButtonState();
    }

    private toggleScope(): void {
        if (!this.hasAlternativeScope()) {
            return;
        }
        const currentItem = this.currentItem;
        this.applyScope(!this.onlyCurrentSource, currentItem ?? undefined);
        this.resetViewport();
        void this.renderCurrentItem();
    }

    private resetViewport(): void {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.dragPointerId = null;
    }

    private goPrevious(): void {
        if (this.index <= 0) {
            return;
        }
        this.index -= 1;
        this.resetViewport();
        void this.renderCurrentItem();
    }

    private goNext(): void {
        if (this.index >= this.items.length - 1) {
            return;
        }
        this.index += 1;
        this.resetViewport();
        void this.renderCurrentItem();
    }

    private zoomOut(): void {
        this.scale = Math.max(PREVIEW_SCALE_MIN, Number((this.scale - PREVIEW_SCALE_STEP).toFixed(2)));
        this.applyTransformState();
    }

    private zoomIn(): void {
        this.scale = Math.min(PREVIEW_SCALE_MAX, Number((this.scale + PREVIEW_SCALE_STEP).toFixed(2)));
        this.applyTransformState();
    }

    private togglePanMode(): void {
        this.panEnabled = !this.panEnabled;
        this.applyPanModeState();
    }

    private applyPanModeState(): void {
        if (!this.contentAreaEl) {
            return;
        }
        this.contentAreaEl.classList.toggle("is-pan-enabled", this.panEnabled);
        this.panButtonEl?.classList.toggle("is-active", this.panEnabled);
    }

    private applyTransformState(): void {
        if (!this.contentAreaEl) {
            return;
        }
        this.contentAreaEl.style.setProperty("--jm-preview-scale", String(this.scale));
        this.contentAreaEl.style.setProperty("--jm-preview-offset-x", `${this.offsetX}px`);
        this.contentAreaEl.style.setProperty("--jm-preview-offset-y", `${this.offsetY}px`);
    }

    private async renderCurrentItem(): Promise<void> {
        const item = this.currentItem;
        if (!item || !this.contentAreaEl) {
            return;
        }

        this.titleTextEl?.setText(item.name);
        this.counterEl?.setText(this.items.length > 1 ? `${this.index + 1} / ${this.items.length}` : "");
        if (this.prevButtonEl) {
            this.prevButtonEl.disabled = this.index <= 0;
        }
        if (this.nextButtonEl) {
            this.nextButtonEl.disabled = this.index >= this.items.length - 1;
        }
        if (this.zoomOutButtonEl) {
            this.zoomOutButtonEl.disabled = this.scale <= PREVIEW_SCALE_MIN;
        }
        if (this.zoomInButtonEl) {
            this.zoomInButtonEl.disabled = this.scale >= PREVIEW_SCALE_MAX;
        }
        this.updateScopeButtonState();

        this.applyPanModeState();
        this.applyTransformState();
        this.renderChild?.unload();
        this.renderChild = null;
        this.contentAreaEl.empty();

        if (item.imageSrc) {
            this.contentAreaEl.createEl("img", {
                attr: {
                    src: item.imageSrc,
                    alt: item.name,
                },
            });
            return;
        }

        const markdown = item.markdown.trim();
        if (!markdown) {
            return;
        }
        this.renderChild = new MarkdownRenderChild(this.contentAreaEl);
        this.renderChild.onload();
        await MarkdownRenderer.render(this.app, markdown, this.contentAreaEl, item.sourcePath, this.renderChild);
    }

    private handlePointerDown = (event: PointerEvent): void => {
        if (!this.panEnabled) {
            return;
        }

        const target = event.target;
        if (!(target instanceof Element) || !target.closest("img")) {
            return;
        }

        this.dragPointerId = event.pointerId;
        this.dragStartX = event.clientX;
        this.dragStartY = event.clientY;
        this.dragOriginX = this.offsetX;
        this.dragOriginY = this.offsetY;
        if (this.contentAreaEl?.hasPointerCapture(event.pointerId) === false) {
            this.contentAreaEl.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
    };

    private handlePointerMove = (event: PointerEvent): void => {
        if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
            return;
        }

        this.offsetX = this.dragOriginX + (event.clientX - this.dragStartX);
        this.offsetY = this.dragOriginY + (event.clientY - this.dragStartY);
        this.applyTransformState();
    };

    private handlePointerUp = (event: PointerEvent): void => {
        if (this.dragPointerId === null || event.pointerId !== this.dragPointerId) {
            return;
        }

        if (this.contentAreaEl?.hasPointerCapture(event.pointerId)) {
            this.contentAreaEl.releasePointerCapture(event.pointerId);
        }
        this.dragPointerId = null;
    };

    private handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.close();
            return;
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            this.goPrevious();
            return;
        }
        if (event.key === "ArrowRight") {
            event.preventDefault();
            this.goNext();
            return;
        }
        if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            this.zoomIn();
            return;
        }
        if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            this.zoomOut();
        }
    };
}
