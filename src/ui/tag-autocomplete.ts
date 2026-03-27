/**
 * Svelte action: inline tag autocomplete for a <textarea>.
 *
 * Usage:
 *   <textarea use:tagAutocomplete={existingTags} ... />
 *
 * Shows a floating dropdown at the cursor position whenever the user types
 * a `#prefix`. Completely self-contained — no extra DOM wrappers needed.
 */

const TAG_START_RE = /(^|[\s(])#([^\s#.,!?()[\]{}"']*)$/;

// ---------------------------------------------------------------------------
// Cursor pixel-position via mirror div
// ---------------------------------------------------------------------------

function getCaretViewportPos(el: HTMLTextAreaElement): {
	top: number;
	left: number;
	lineHeight: number;
} {
	const pos = el.selectionStart ?? 0;
	const elRect = el.getBoundingClientRect();
	const cs = window.getComputedStyle(el);
	const lineHeight =
		parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;

	// Build a hidden mirror div positioned on top of the textarea.
	// We use position:fixed so getBoundingClientRect on the marker span
	// already gives us viewport coordinates directly.
	const mirror = document.createElement("div");
	mirror.style.position = "fixed";
	mirror.style.visibility = "hidden";
	mirror.style.pointerEvents = "none";
	mirror.style.top = `${elRect.top}px`;
	mirror.style.left = `${elRect.left}px`;
	mirror.style.width = `${elRect.width}px`;
	mirror.style.height = "auto";
	mirror.style.whiteSpace = "pre-wrap";
	mirror.style.wordWrap = "break-word";
	mirror.style.overflowX = "hidden";
	mirror.style.overflowY = "hidden";
	mirror.style.boxSizing = cs.boxSizing;
	mirror.style.paddingTop = cs.paddingTop;
	mirror.style.paddingRight = cs.paddingRight;
	mirror.style.paddingBottom = cs.paddingBottom;
	mirror.style.paddingLeft = cs.paddingLeft;
	mirror.style.borderTopWidth = cs.borderTopWidth;
	mirror.style.borderRightWidth = cs.borderRightWidth;
	mirror.style.borderBottomWidth = cs.borderBottomWidth;
	mirror.style.borderLeftWidth = cs.borderLeftWidth;
	mirror.style.borderStyle = "solid";
	mirror.style.borderColor = "transparent";
	mirror.style.fontFamily = cs.fontFamily;
	mirror.style.fontSize = cs.fontSize;
	mirror.style.fontWeight = cs.fontWeight;
	mirror.style.fontStyle = cs.fontStyle;
	mirror.style.lineHeight = cs.lineHeight;
	mirror.style.letterSpacing = cs.letterSpacing;
	mirror.style.wordSpacing = cs.wordSpacing;
	mirror.style.textIndent = cs.textIndent;
	(mirror.style as CSSStyleDeclaration & { tabSize: string }).tabSize =
		(cs as CSSStyleDeclaration & { tabSize: string }).tabSize;

	document.body.appendChild(mirror);

	mirror.textContent = el.value.substring(0, pos);

	const marker = document.createElement("span");
	marker.textContent = "\u200b"; // zero-width space
	mirror.appendChild(marker);

	const markerRect = marker.getBoundingClientRect();
	document.body.removeChild(mirror);

	// Subtract textarea's internal scroll so the position matches
	// what is actually visible in the viewport.
	return {
		top: markerRect.top - el.scrollTop,
		left: Math.max(
			elRect.left,
			Math.min(markerRect.left - el.scrollLeft, elRect.right - 164),
		),
		lineHeight,
	};
}

// ---------------------------------------------------------------------------
// Popup management
// ---------------------------------------------------------------------------

function createPopupEl(): HTMLUListElement {
	const ul = document.createElement("ul");
	ul.className = "jm-tag-ac-popup";
	ul.setAttribute("role", "listbox");
	ul.style.position = "fixed";
	ul.style.zIndex = "9999";
	ul.style.listStyle = "none";
	ul.style.margin = "0";
	ul.style.padding = "4px 0";
	ul.style.background = "var(--background-primary)";
	ul.style.border = "1px solid var(--background-modifier-border)";
	ul.style.borderRadius = "6px";
	ul.style.boxShadow = "0 4px 14px rgba(0,0,0,0.18)";
	ul.style.maxHeight = "200px";
	ul.style.overflowY = "auto";
	ul.style.minWidth = "160px";
	return ul;
}

function renderItems(
	popup: HTMLUListElement,
	suggestions: string[],
	selectedIndex: number,
	onAccept: (tag: string) => void,
	onHover: (i: number) => void,
) {
	popup.innerHTML = "";
	suggestions.forEach((tag, i) => {
		const li = document.createElement("li");
		li.textContent = tag;
		li.setAttribute("role", "option");
		li.setAttribute("aria-selected", String(i === selectedIndex));
		li.style.padding = "5px 12px";
		li.style.cursor = "pointer";
		li.style.fontSize = "0.9em";
		li.style.whiteSpace = "nowrap";
		li.style.color =
			i === selectedIndex
				? "var(--text-accent)"
				: "var(--text-normal)";
		li.style.background =
			i === selectedIndex
				? "var(--background-modifier-hover)"
				: "";
		li.addEventListener("mousedown", (e) => {
			e.preventDefault();
			onAccept(tag);
		});
		li.addEventListener("mouseover", () => onHover(i));
		popup.appendChild(li);
	});
}

function positionPopup(
	popup: HTMLUListElement,
	el: HTMLTextAreaElement,
) {
	const { top, left, lineHeight } = getCaretViewportPos(el);
	const elRect = el.getBoundingClientRect();
	const POPUP_MAX_H = 200;
	const MARGIN = 2;

	// Prefer showing below; flip above if insufficient space.
	const spaceBelow = window.innerHeight - (top + lineHeight);
	const spaceAbove = top;
	let finalTop: number;
	if (spaceBelow >= Math.min(POPUP_MAX_H, 80) || spaceBelow >= spaceAbove) {
		finalTop = top + lineHeight + MARGIN;
	} else {
		finalTop = top - POPUP_MAX_H - MARGIN;
	}

	// Clamp horizontally inside the textarea.
	const popupW = 164;
	const finalLeft = Math.min(left, elRect.right - popupW);

	popup.style.top = `${finalTop}px`;
	popup.style.left = `${finalLeft}px`;
}

// ---------------------------------------------------------------------------
// Svelte action
// ---------------------------------------------------------------------------

export function tagAutocomplete(
	node: HTMLTextAreaElement,
	tags: string[],
): { update(tags: string[]): void; destroy(): void } {
	let currentTags = tags;
	let popup: HTMLUListElement | null = null;
	let suggestions: string[] = [];
	let selectedIndex = -1;
	let isAccepting = false; // guard against the synthetic input fired by accept()

	function openPopup() {
		if (!popup) {
			popup = createPopupEl();
			document.body.appendChild(popup);
		}
	}

	function closePopup() {
		if (popup) {
			popup.remove();
			popup = null;
		}
		suggestions = [];
		selectedIndex = -1;
	}

	function refresh() {
		if (!popup) return;
		renderItems(popup, suggestions, selectedIndex, accept, (i) => {
			selectedIndex = i;
			refresh();
		});
		positionPopup(popup, node);
	}

	function accept(tag: string) {
		const pos = node.selectionStart ?? 0;
		const before = node.value.slice(0, pos);
		const after = node.value.slice(pos);
		// tag already contains the leading '#'; append a space so the user
		// can keep typing without the next character merging into the tag.
		const newBefore = before.replace(
			TAG_START_RE,
			(_, pre) => `${pre}${tag} `,
		);
		node.value = newBefore + after;
		closePopup();
		// Notify Svelte's bind:value — guard so onInput skips this synthetic event
		isAccepting = true;
		node.dispatchEvent(new InputEvent("input", { bubbles: true }));
		isAccepting = false;
		const newPos = newBefore.length;
		node.focus();
		node.setSelectionRange(newPos, newPos);
	}

	// --- Event handlers ---

	function onInput() {
		if (isAccepting) return;

		const pos = node.selectionStart ?? 0;
		const before = node.value.slice(0, pos);
		const match = TAG_START_RE.exec(before);
		if (!match) {
			closePopup();
			return;
		}
		const prefix = (match[2] ?? "").toLowerCase();

		// Tags are stored with a leading '#' (e.g. "#work"); prefix is the
		// bare text after '#' that the user has typed so far (e.g. "wo").
		// Prioritise prefix matches, then fall back to substring matches.
		const prefixHits = currentTags.filter((t) => {
			const body = t.startsWith("#") ? t.slice(1).toLowerCase() : t.toLowerCase();
			return body.startsWith(prefix) && body !== prefix;
		});
		const substringHits = currentTags.filter((t) => {
			const body = t.startsWith("#") ? t.slice(1).toLowerCase() : t.toLowerCase();
			return !body.startsWith(prefix) && body.includes(prefix);
		});
		const next = [...prefixHits, ...substringHits].slice(0, 8);

		if (next.length === 0) {
			closePopup();
			return;
		}

		// Keep the highlighted item stable across keystrokes when possible.
		const prevTag =
			selectedIndex >= 0 ? suggestions[selectedIndex] : null;
		suggestions = next;
		selectedIndex = prevTag ? suggestions.indexOf(prevTag) : -1;

		openPopup();
		refresh();
	}

	function onKeydown(e: KeyboardEvent) {
		if (!popup || suggestions.length === 0) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			e.stopImmediatePropagation();
			selectedIndex = (selectedIndex + 1) % suggestions.length;
			refresh();
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			e.stopImmediatePropagation();
			selectedIndex =
				selectedIndex <= 0
					? suggestions.length - 1
					: selectedIndex - 1;
			refresh();
			return;
		}
		if (e.key === "Tab" && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			e.stopImmediatePropagation();
			accept(suggestions[selectedIndex >= 0 ? selectedIndex : 0] ?? "");
			return;
		}
		if (
			e.key === "Enter" &&
			!e.ctrlKey &&
			!e.metaKey &&
			selectedIndex >= 0
		) {
			e.preventDefault();
			e.stopImmediatePropagation();
			accept(suggestions[selectedIndex] ?? "");
			return;
		}
		if (e.key === "Escape") {
			e.stopImmediatePropagation();
			closePopup();
			return;
		}
	}

	function onBlur() {
		// Delay so mousedown on popup items fires before blur clears them.
		setTimeout(closePopup, 150);
	}

	function onScroll() {
		if (popup) positionPopup(popup, node);
	}

	// Use capture so we intercept before other keydown listeners (e.g. Obsidian).
	node.addEventListener("input", onInput);
	node.addEventListener("keydown", onKeydown, { capture: true });
	node.addEventListener("blur", onBlur);
	node.addEventListener("scroll", onScroll);

	return {
		update(newTags: string[]) {
			currentTags = newTags;
		},
		destroy() {
			closePopup();
			node.removeEventListener("input", onInput);
			node.removeEventListener("keydown", onKeydown, {
				capture: true,
			});
			node.removeEventListener("blur", onBlur);
			node.removeEventListener("scroll", onScroll);
		},
	};
}
