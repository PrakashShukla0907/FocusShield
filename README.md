# FocusShield 🛡️

FocusShield is a minimalist, powerful Chrome extension designed to help you stay productive by tracking the time you spend on different websites and allowing you to set time limits for specific domains. 

With a beautiful, aggressively compact black-and-white UI, FocusShield provides immediate feedback on your browsing habits without getting in your way.

## ✨ Features

- **Real-Time Usage Tracking**: Automatically tracks the exact hours and minutes spent on the current site.
- **Custom Time Limits**: Set strict time limits (in minutes) for specific websites to prevent doomscrolling or procrastination.
- **Top Usage Leaderboard**: View a quick overview of your top 5 most-visited websites right from the popup.
- **Dynamic Popup UI**: The UI intelligently adapts, hiding limit settings when you are on an internal or unsupported page.
- **Aesthetic Minimalist Design**: A meticulously "squished" vertical layout with a sharp, high-contrast, black-and-white theme.

## 🛠️ Tech Stack

- **Frontend Framework**: [React 18](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Architecture**: Chrome Extension Manifest V3 (`chrome.storage.local`, `chrome.tabs`)

## 🚀 Installation & Setup

To use this extension locally in your own Chrome browser:

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone https://github.com/PrakashShukla0907/FocusShield.git
   cd FocusShield
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build the Extension**:
   ```bash
   npm run build
   ```
   *This command will bundle the React code and output the compiled extension files into the `dist/` folder.*

4. **Load into Chrome**:
   - Open your Chrome browser and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in the top right corner).
   - Click on the **Load unpacked** button in the top left.
   - Select the `dist/` folder generated inside your `FocusShield` project directory.
   - The FocusShield icon will now appear in your browser toolbar!

## 💻 Development

To run the app in a local web environment for testing the UI (Note: Chrome Extension APIs like `chrome.storage` will fallback to mock data):

```bash
npm run dev
```

Visit `http://localhost:5173` to see the live UI with Hot Module Replacement.

## 🤝 Contributing
Feel free to submit issues or pull requests to improve the extension.

## 📄 License
MIT License
