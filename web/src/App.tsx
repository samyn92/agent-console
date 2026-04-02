import { Router, Route } from "@solidjs/router";
import MainApp from "./pages/MainApp";
import SettingsPage from "./pages/Settings";

// Minimal routing - the app is now a single unified experience
// Only settings remains as a separate page
export default function App() {
  return (
    <Router>
      <Route path="/" component={MainApp} />
      <Route path="/settings" component={SettingsPage} />
    </Router>
  );
}
