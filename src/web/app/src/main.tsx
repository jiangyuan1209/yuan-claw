import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ConfigProvider
            theme={{
                algorithm: theme.defaultAlgorithm,
                token: {
                    colorPrimary: "#1677ff",
                    borderRadius: 8,
                },
            }}
        >
            <App />
        </ConfigProvider>
    </React.StrictMode>,
);
