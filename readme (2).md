# vMix - Unmix the Signal

> Professional live video production, AI-driven signal management, and multi-stream switching workflows built for modern broadcasters, creators, and event producers.

---

## 📌 Overview

**vMix - Unmix the Signal** is a modular repository designed to streamline live video production, hardware acceleration, and dynamic multi-camera switching workflows. By combining the power of **vMix** with intelligent signal routing and automated control, this project helps eliminate latency, clean up audio/video routing bugs, and elevate live broadcasting quality.

---

## 🚀 Key Features

* **Multi-Camera Switching & NDI/SRT Integration:** Native support for IP-based production workflows using NDI and Secure Reliable Transport (SRT) protocols without bulky hardware capture cards.
* **AI-Driven Signal Management:** Smart filtering and automated routing scripts to "unmix" complex multi-source audio and video channels.
* **Hardware-Accelerated Encoding:** Optimized for NVIDIA NVENC and GPU-based rendering to handle multiple 4K/HD inputs smoothly.
* **Dynamic Overlays & Titles:** Integrates with GT Titler and data sources for real-time scorebugs, lower thirds, and animated graphics.
* **Instant Replay & ISO Recording:** Built-in hooks for multi-camera slow-motion instant replays and separate multi-recorder feeds.

---

## 📁 Repository Structure

```text
├── assets/            # Logos, diagrams, and UI screenshots
├── docs/              # Architecture diagrams and configuration guides
├── scripts/           # Automation and signal-processing scripts (Python/PowerShell)
├── templates/         # vMix preset files and title templates (.vmix, .xaml)
└── README.md          # Project documentation
```

---

## ⚙️ Prerequisites & System Requirements

To run this project and interface seamlessly with vMix, ensure your environment meets the following specifications:

* **Operating System:** Windows 10 / 11 (64-bit) *(vMix is Windows-exclusive)*
* **Processor:** Intel Core i7 (3GHz+) or AMD Ryzen equivalent
* **Memory:** 16 GB RAM (32 GB recommended for 4K/NDI workflows)
* **Graphics:** Dedicated NVIDIA GPU (supporting multiple NVENC hardware encodes, e.g., RTX series)
* **Software:** [vMix (v27 or later)](https://www.vmix.com/) and Python 3.10+ (if running backend automation scripts)

---

## 🛠️ Installation & Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/your-username/vmix-unmixthesignal.git
   cd vmix-unmixthesignal
   ```

2. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your vMix Web Controller endpoint and local ports:
   ```env
   VMIX_HOST=127.0.0.1
   VMIX_PORT=8088
   LOG_LEVEL=INFO
   ```

3. **Install Dependencies (for automation scripts):**
   ```bash
   pip install -r requirements.txt
   ```

---

## 🖥️ Usage

1. Open **vMix** on your Windows production machine.
2. Load one of the provided layout presets from the `templates/` folder (`templates/default_production.vmix`).
3. Run your automation scripts to monitor or manipulate the signal:
   ```bash
   python scripts/signal_monitor.py
   ```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps to contribute:
1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 💡 Acknowledgements & Credits
* Built with [vMix Live Production Software](https://www.vmix.com/).
* Inspired by advanced broadcast engineering and IP workflow standards (NDI/SRT).