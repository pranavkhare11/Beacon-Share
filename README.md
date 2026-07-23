# Beacon Share

A peer-to-peer file sharing application that enables secure and direct file transfer between users without intermediaries.

## 🎯 Overview

Beacon Share is a React-based peer-to-peer (P2P) file sharing platform. It leverages WebRTC technology through PeerJS to establish direct connections between users, allowing them to share files seamlessly and securely.

## 🚀 Features

- **Peer-to-Peer Transfer**: Direct file sharing between peers without server intermediaries
- **WebRTC Technology**: Secure and efficient data transfer using modern web standards
- **Drag & Drop Upload**: Intuitive file upload with drag-and-drop support
- **Real-time Transfers**: Live progress tracking for file transfers
- **React-based UI**: Modern, responsive user interface
- **Zero Configuration**: Easy setup and connection between peers

## 🛠️ Tech Stack

- **Frontend**: React 19.2.7
- **Build Tool**: Vite
- **Language**: JavaScript (61.4%)
- **Styling**: CSS (38.3%)
- **P2P Library**: PeerJS 1.5.5
- **File Upload**: React Dropzone
- **Routing**: React Router DOM
- **Linting**: Oxlint
- **Dev Tools**: Babel

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/pranavkhare11/Beacon-Share.git
cd Beacon-Share

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📜 Available Scripts

- `npm run dev` - Start the development server with hot module replacement
- `npm run build` - Build the project for production
- `npm run lint` - Run Oxlint for code quality checks
- `npm run preview` - Preview the production build locally

## 🔧 Configuration

The project uses Vite for fast development and optimized production builds. Configuration can be found in:
- `vite.config.ts` - Vite configuration
- `.oxlintrc.json` - Oxlint configuration

## 🎨 Project Structure

```
src/
├── components/     # React components
├── pages/          # Page components
├── utils/          # Utility functions
├── hooks/          # Custom React hooks
├── styles/         # CSS stylesheets
└── App.tsx         # Main app component
```

## 🔐 How It Works

1. **Connection**: Users generate unique peer IDs to establish connections
2. **File Selection**: Drop or select files using the intuitive interface
3. **Transfer**: Files are transferred directly between peers via WebRTC
4. **Encryption**: Data transfer is inherently secure through WebRTC

## 🚀 Getting Started

1. Start the application: `npm run dev`
2. Share your peer ID with another user
3. Enter their peer ID to establish a connection
4. Drag and drop files to share them instantly

## 🤝 Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.

## 👤 Author

**Pranav Khare**
- GitHub: [@pranavkhare11](https://github.com/pranavkhare11)

## 📞 Support

If you encounter any issues or have suggestions, please open an [issue](https://github.com/pranavkhare11/Beacon-Share/issues) on GitHub.

## 🔗 Resources

- [PeerJS Documentation](https://peerjs.com/)
- [WebRTC Documentation](https://webrtc.org/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
