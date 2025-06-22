import { toString } from 'mdast-util-to-string';
import { EXIT, visit } from 'unist-util-visit';

export function remarkDescription() {
	return (tree, { data }) => {
		if (!data.astro.frontmatter.description) {
			visit(tree, 'paragraph', (node) => {
				data.astro.frontmatter.description = toString(node);
				return EXIT;
			});
		}
	};
}
