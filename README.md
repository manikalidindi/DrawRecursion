# Live Recursion Tree Visualizer

A frontend-only web app for visualizing recursive Python functions step by step.

Paste a recursive function, choose a starting call, and watch:

- the recursion tree grow live
- the active source line update
- local variables change at each step
- return values flow back to parent calls
- the call stack and timeline stay synchronized

This project is built with plain HTML, CSS, and JavaScript. It does not need a backend.

## Highlights

- Live recursion tree with adaptive spacing
- Return arrows drawn back to parent calls
- Zoom in and zoom out controls for large trees
- Source view placed beside the tree for easier reading
- Variable updates, active frame view, and call stack
- Step-by-step timeline with playback controls
- Sample presets for quick testing
- Static deployment friendly

## Project Files

- `index.html` - page structure
- `styles.css` - visual design and layout
- `script.js` - recursion tracer, UI rendering, and playback logic

## How It Works

The app includes a browser-side Python subset tracer written in JavaScript. When you paste supported recursive Python code and provide a starting call, the tracer:

1. Parses the Python code
2. Executes the recursive calls in the browser
3. Builds a recursion tree from the call flow
4. Records line-by-line execution events
5. Replays those events in the UI

## Supported Python Subset

The visualizer is designed for common recursive problem patterns. It currently supports:

- top-level and nested `def` functions
- helper functions and closures
- type-annotated function headers such as `def fib(n: int) -> int:`
- method-style function headers with leading `self` or `cls`
- default parameters
- `if`, `elif`, and `else`
- `return` and `pass`
- variable assignment
- `for` loops
- list literals and indexing
- list comprehensions
- common list and string methods used in recursive helpers such as `append`, `pop`, `sort`, and `join`
- arithmetic and comparisons
- recursive calls inside expressions
- built-ins: `len`, `range`, `int`, `float`, `min`, `max`, `sum`, `sorted`

## Current Limitations

This is not a full Python interpreter.

Some Python code may still not work, especially code that depends on:

- classes
- imports
- decorators
- generators
- comprehensions beyond the currently supported list form
- advanced data structures and library features
- arbitrary Python syntax outside the supported recursion-oriented subset

If a function is outside the supported subset, the app will show an error instead of drawing the tree.

## Running Locally

Because this is a static app, you can run it in any of these simple ways:

### Option 1

Open `index.html` directly in a browser.

### Option 2

Serve the folder with any static server, for example:

```bash
python -m http.server
```

Then open the local URL shown by the server.

## Deployment

This project can be deployed without a backend.

You can host it on any static hosting platform, such as:

- GitHub Pages
- Cloudflare Pages
- Netlify
- Vercel

To deploy, upload:

- `index.html`
- `styles.css`
- `script.js`

## Example Use Cases

- Fibonacci recursion trees
- factorial visualization
- array sum recursion
- helper-function based recursion
- recursive dynamic programming exploration
- recursion teaching demos

## Author

Created by Manikanta Kalidindi.

Contact is available in the site footer.
