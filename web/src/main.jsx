// 应用入口
import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./store";
import { LangProvider } from "./i18n";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LangProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </LangProvider>
  </React.StrictMode>
);
