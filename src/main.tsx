import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./ui/App"
import "@xyflow/react/dist/style.css"
import "./styles.css"

const container = document.getElementById("root")
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
