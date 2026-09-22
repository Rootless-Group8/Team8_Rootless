import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./auth/LoginPage";
import RegistrationPage from "./auth/RegistrationPage";
import VisaExplorerPage from "./pages/VisaExplorerPage";

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegistrationPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/visa-explorer"
            element={
              <ProtectedRoute>
                <VisaExplorerPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}