import React from "react";

/** Tags kept from the GitHub release HTML, everything else is unwrapped to its text */
const ALLOWED_TAGS = new Set(["p", "br", "a", "ul", "ol", "li", "strong", "b", "em", "i", "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "del"]);

function toReact(node: ChildNode, key: number): React.ReactNode {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent;
	if (node.nodeType !== Node.ELEMENT_NODE) return null;

	const element = node as Element;
	const tag = element.tagName.toLowerCase();
	const children = Array.from(element.childNodes).map(toReact);

	if (!ALLOWED_TAGS.has(tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
	if (tag === "br" || tag === "hr") return React.createElement(tag, { key });
	if (tag === "a") {
		const href = element.getAttribute("href") ?? "";
		// Only web links: the main process opens them in the browser
		if (!/^https?:\/\//i.test(href)) return <React.Fragment key={key}>{children}</React.Fragment>;
		return (
			<a key={key} href={href} target="_blank" rel="noreferrer">
				{children}
			</a>
		);
	}
	return React.createElement(tag, { key }, children);
}

/**
 * Release notes of GitHub (HTML) rendered as React elements: no raw HTML injection, attributes dropped except link targets
 */
export const ReleaseNotes: React.FC<{ html: string }> = ({ html }) => {
	// Plain text notes keep their line breaks
	if (!/<[a-z][\s\S]*>/i.test(html)) return <div className="Updates__notes Updates__notes--plain">{html}</div>;
	const body = new DOMParser().parseFromString(html, "text/html").body;
	return <div className="Updates__notes">{Array.from(body.childNodes).map(toReact)}</div>;
};
