export interface MemoRendererParams {
    markdown: string;
    sourcePath: string;
    previewGroup: string;
    renderMemoContent?: (el: HTMLElement, markdown: string, sourcePath: string) => Promise<void>;
    openRenderedImagePreview?: (imageEl: HTMLImageElement, sourcePath: string, previewGroup: string) => void;
}

export function memoRenderer(node: HTMLElement, params: MemoRendererParams) {
    let renderVersion = 0;
    let currentSourcePath = params?.sourcePath ?? "";
    let currentPreviewGroup = params?.previewGroup ?? "";
    let lastMarkdown: string | null = null;
    let lastSourcePath: string | null = null;
    let lastPreviewGroup: string | null = null;
    let renderer = params?.renderMemoContent;
    let galleryOpener = params?.openRenderedImagePreview;

    function handleImageClick(event: MouseEvent) {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const imageEl = target.closest("img");
        if (!(imageEl instanceof HTMLImageElement) || !node.contains(imageEl)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        galleryOpener?.(imageEl, currentSourcePath, currentPreviewGroup);
    }

    async function run(currentParams: MemoRendererParams) {
        const markdownRaw = currentParams?.markdown ?? "";
        const sourcePath = currentParams?.sourcePath ?? "";
        const previewGroup = currentParams?.previewGroup ?? "";

        renderer = currentParams?.renderMemoContent;
        galleryOpener = currentParams?.openRenderedImagePreview;
        currentSourcePath = sourcePath;
        currentPreviewGroup = previewGroup;

        node.dataset.sourcePath = sourcePath;
        node.dataset.previewGroup = previewGroup;

        const shouldRerender =
            markdownRaw !== lastMarkdown ||
            sourcePath !== lastSourcePath ||
            previewGroup !== lastPreviewGroup;

        if (!shouldRerender) {
            return;
        }

        lastMarkdown = markdownRaw;
        lastSourcePath = sourcePath;
        lastPreviewGroup = previewGroup;

        const currentVersion = ++renderVersion;
        node.replaceChildren();

        const markdown = markdownRaw.trim();
        if (!markdown) {
            return;
        }

        try {
            await renderer?.(node, markdown, sourcePath);
        } catch (error) {
            if (currentVersion !== renderVersion) {
                return;
            }
            console.error("Failed to render memo content", error);
            const fallbackEl = document.createElement("p");
            fallbackEl.textContent = markdown;
            node.replaceChildren(fallbackEl);
        }
    }

    node.addEventListener("click", handleImageClick);
    void run(params);

    return {
        update(nextParams: MemoRendererParams) {
            void run(nextParams);
        },
        destroy() {
            renderVersion += 1;
            node.removeEventListener("click", handleImageClick);
            node.replaceChildren();
        },
    };
}
