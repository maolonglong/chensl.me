Generate a concise summary for a blog post written in markdown format located at $ARGUMENTS, and update its front matter with the summary under the `description` key. The front matter can be in either YAML or TOML format, so ensure compatibility with both formats. The language of the summary must match the language of the blog content.

# Steps

1. **Read the Markdown File**: Access the file located at `$ARGUMENTS` and retrieve its content.
2. **Detect Blog Language**: Analyze the content of the blog to determine its language.
3. **Analyze the Blog Content**: Identify the main idea or key points of the blog content.
4. **Generate a Concise Summary**: Write a short and clear summary (1–2 sentences) that captures the essence of the blog post in the same language as the blog content.
5. **Detect Front Matter Format**: Determine whether the front matter is in YAML or TOML format based on its syntax:
   - YAML front matter is enclosed between `---`.
   - TOML front matter is enclosed between `+++`.
6. **Update Front Matter**: Add or update the `description` key with the generated summary:
   - For YAML: Use `description: [summary]`.
   - For TOML: Use `description = "[summary]"`.
7. **Preserve Formatting**: Ensure the updated markdown retains its original structure and formatting.
