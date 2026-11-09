import { createElement, Fragment, type ReactNode } from "react";
import { Box } from "@mui/material";

/** Tags kept from the GitHub release HTML, everything else is unwrapped to its text */
const allowedTags = new Set(["p", "br", "a", "ul", "ol", "li", "strong", "b", "em", "i", "code", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "del"]);

function toReact(node: ChildNode, key: number): ReactNode {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent;
	if (node.nodeType !== Node.ELEMENT_NODE) return null;

	const element = node as Element;
	const tag = element.tagName.toLowerCase();
	const children = Array.from(element.childNodes).map(toReact);

	if (!allowedTags.has(tag)) return <Fragment key={key}>{children}</Fragment>;
	if (tag === "br" || tag === "hr") return createElement(tag, { key });
	if (tag === "a") {
		const href = element.getAttribute("href") ?? "";
		// Only web links: the window open handler of the main process opens them in the browser
		if (!/^https?:\/\//i.test(href)) return <Fragment key={key}>{children}</Fragment>;
		return (
			<a key={key} href={href} target="_blank" rel="noreferrer">
				{children}
			</a>
		);
	}
	return createElement(tag, { key }, children);
}

/**
 * Release notes of GitHub (HTML) rendered as React elements: no raw HTML injection, attributes dropped except link targets
 */
export function ReleaseNotes({ html }: Readonly<{ html: string }>) {
	// Plain text notes keep their line breaks
	const plain = !/<[a-z][\s\S]*>/i.test(html);
	const content = plain ? html : Array.from(new DOMParser().parseFromString(html, "text/html").body.childNodes).map(toReact);

	return (
		<Box
			sx={{
				maxHeight: 220,
				overflowY: "auto",
				fontSize: "0.8rem",
				color: "var(--text-muted)",
				whiteSpace: plain ? "pre-wrap" : undefined,
				overflowWrap: "anywhere",
				"& h1, & h2, & h3, & h4, & h5, & h6": { fontSize: "0.85rem", fontWeight: 600, color: "text.primary", my: 1 },
				"& p, & ul, & ol": { my: 0.75 },
				"& ul, & ol": { pl: 2.5 },
				"& a": { color: "primary.main" },
				"& code": { fontFamily: "var(--font-mono)", fontSize: "0.75rem" },
			}}
		>
			{content}
		</Box>
	);
}
