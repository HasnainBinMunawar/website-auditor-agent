# website-auditor-agent

![alt text](image.png)


<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/5c2c1dc4-30e7-4808-a63d-6a9e458c308f" />



⚙️ Installation & Setup Guide
1️⃣ Clone the Repository

git clone https://github.com/HasnainBinMunawar/website-auditor-agent.git
cd website-auditor-agent

2️⃣ Install Dependencies
Make sure you have Node.js v18+ installed.

Using npm:
npm install

Or using yarn:
yarn install

3️⃣ Configure Environment Variables
Create a .env.local file in the root directory:

OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
The project will automatically fall back to the next available API if one fails.

4️⃣ Run the Development Server

npm run dev
or

yarn dev
The app will be available at: http://localhost:3000


5️⃣ Build for Production

npm run build
npm start

📌 Additional Notes
Multi-LLM Support: OpenAI → Gemini → DeepSeek fallback logic ensures zero-failure AI responses.
Data Storage: Audit results are stored locally in /data/audits/.
PDF Reports: One-click downloadable reports are generated via /api/generate-report-pdf
