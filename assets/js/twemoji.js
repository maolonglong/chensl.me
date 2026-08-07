import twemoji from "@twemoji/api";

const options = {
  base: "https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/",
  folder: "svg",
  ext: ".svg"
};
const excluded = "code, iframe, noframes, noscript, pre, script, select, style, textarea";

// Twemoji code is MIT licensed; its graphics are CC BY 4.0.
// https://github.com/jdecked/twemoji
window.renderEmoji = root => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      if (node.parentElement?.closest(excluded)) {
        return NodeFilter.FILTER_REJECT;
      }
      return twemoji.test(node.nodeValue)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  nodes.forEach(node => {
    const container = document.createElement("span");
    node.replaceWith(container);
    container.append(node);
    twemoji.parse(container, options);
    container.replaceWith(...container.childNodes);
  });
};

window.addEventListener("DOMContentLoaded", () => {
  window.renderEmoji(document.body);
}, { once: true });
