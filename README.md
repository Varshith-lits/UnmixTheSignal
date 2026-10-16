# Unmix The Signal

**Unmix The Signal** is a web-based audio signal separation project focused on the idea of recovering individual source signals from a mixed signal using **Independent Component Analysis (ICA)**.

## 🚀 Live Demo

Try the website here: **[Unmix The Signal – Live Website](https://vmix-unmixthesignal.ai.studio/)**

## 💡 About the Project

In real-world situations, multiple sounds can be recorded together in one mixed audio signal. Separating those sounds can help us study or listen to the individual sources.

Unmix The Signal explores this problem using Independent Component Analysis (ICA), a technique that attempts to separate mixed signals by finding statistically independent underlying sources.

The project is built as a web application so users can explore the signal-separation concept through an accessible interface.

## ✨ Key Idea

- **Mixed signals:** Work with audio signals that contain multiple sources.
- **Signal separation:** Explore how ICA can help recover individual source signals from a mixture.
- **Interactive web experience:** Access the project through a browser without needing to set up the development environment.

*The quality of separation depends on the input signals and the assumptions required by ICA.*

## 🛠️ Tech Stack

- **React** – User interface
- **TypeScript** – Type-safe application code
- **Vite** – Development server and build tooling
- **Google Gemini API** – AI integration used by the application

## 🌐 Links

- **Live Website:** https://vmix-unmixthesignal.ai.studio/
- **GitHub Repository:** https://github.com/Varshith-lits/UnmixTheSignal

## 💻 Run Locally

### Prerequisites

- [Node.js](https://nodejs.org/) installed on your computer
- npm (included with Node.js)

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/Varshith-lits/UnmixTheSignal.git
   ```

2. Open the project folder:

   ```bash
   cd UnmixTheSignal
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

4. Configure environment variables if required by the features you want to run. Use `.env.example` as a reference and add your own API key to a local `.env` file. **Do not commit API keys or other secrets to GitHub.**

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Open the local URL shown in your terminal.

### Useful Commands

```bash
npm run dev      # Start the development server
npm run build    # Build the production version
npm run preview  # Preview the production build
npm run lint     # Check TypeScript for errors
```

## 📁 Project Structure

```text
UnmixTheSignal/
├── src/             # Application source code
├── .env.example     # Example environment variables
├── index.html       # HTML entry point
├── package.json     # Dependencies and scripts
├── tsconfig.json    # TypeScript configuration
└── vite.config.ts   # Vite configuration
```

## 🔐 Environment Variables

The project includes an `.env.example` file. If a feature requires an API key, configure it locally using the variable names documented in that file and the project's setup.

Keep private keys in local environment files or the hosting platform's secret settings. Never publish real API keys in your repository.

## 🎯 Project Goal

The goal of Unmix The Signal is to make the concept of audio source separation approachable through a web-based project and demonstrate how signal-processing techniques such as ICA can be used to investigate mixed audio.

---

**Built as a project exploring audio signal processing and Independent Component Analysis.**
