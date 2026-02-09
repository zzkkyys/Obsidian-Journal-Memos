# Journal Memos

**Journal Memos** is an Obsidian plugin that transforms your daily notes into a social-media-style stream. It helps you capture fleeting thoughts, images, and tasks without the friction of managing separate files or databases. All data is stored directly in your Daily Notes.

## ✨ Features

- **📱 Stream View**: A unified timeline of your thoughts from recent days, grouped by date.
- **🧱 Explore View**: A beautiful, responsive masonry (waterfall) grid layout to browse your past memos visually.
  - **Customizable Layout**: Adjust the number of columns in settings or let it adapt automatically.
  - **Rich Media**: Images are neatly organized at the bottom of each card.
- **🖼️ Attachments Gallery**: A dedicated view to browse all images and files you've captured across your memos.
- **🔥 Activity Heatmap**: Visualize your writing habits with a GitHub-style contribution graph.
- **🎨 Native Experience**: Seamlessly integrates with Obsidian's theme and daily note structure.
- **🔒 Privacy First**: No external database, no cloud dependency. Your data stays in your Markdown files.

## 🚀 Getting Started

1. **Install** the plugin and enable it.
2. Click the **Journal Memos** icon (Calendar Check) in the ribbon to open the main view.
3. Start typing in the input box at the top to create your first memo. 
   - Memos are automatically appended to your **Daily Note** for the current day.
   - You can add #tags and attachments.

## ⚙️ Configuration

Go to **Settings > Journal Memos** to customize your experience:

- **Daily Notes Folder**: path to your daily notes (e.g., `DailyNotes`).
- **Stream Window**: Number of days to show in the main stream (default: 30).
- **Heatmap Window**: Range of the activity heatmap (default: 140 days).
- **Explore View Columns**: specific the count of columns for the Explore view (Set `0` for auto-responsive).

## 🛠️ Development

This plugin is built with **Svelte** and **TypeScript**.

### Build Setup

```bash
# Install dependencies
npm install

# Start development server (watch mode)
npm run dev

# Build for production
npm run build
```

### Project Structure

- `src/main.ts`: Plugin entry point and lifecycle management.
- `src/ui/`: Svelte components and view logic.
  - `JournalMemosApp.svelte`: Main application container.
  - `MemoList.svelte` / `MemoRenderer.svelte`: UI components.
- `src/features/`: Core business logic (Service layer).
- `src/data/`: Data parsing and persistence (Daily Note integration).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT
