// 应用入口
import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./store";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
