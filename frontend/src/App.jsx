import { BrowserRouter, Routes, Route } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase/config";
import { useAuth } from "./auth/useAuth";
import NavBar from "./components/NavBar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./auth/LoginPage";
import RegistrationPage from "./auth/RegistrationPage";
import VisaExplorerPage from "./pages/VisaExplorerPage";
import VisaComparisonPage from "./pages/VisaComparisonPage";
import CostOfLivingPage from "./pages/CostOfLivingPage";
import AccountPage from "./pages/AccountPage";
import SettingsPage from "./pages/SettingsPage";
import DocumentUploadPage from "./pages/DocumentUploadPage";
import ChecklistPage from "./pages/ChecklistPage";

// Placeholder data for the /checklist route — ChecklistPage itself takes
// steps/isLoading/error as props and has no idea this data is fake.
// Swap this for a real call to the Checklist Generator API once that
// exists; nothing about ChecklistPage needs to change when that happens.
const sampleChecklistSteps = [
  {
    id: "step-1",
    title: "Apply for your visitor visa",
    description: "Submit your application through the official portal.",
    deadline: "At least 30 days before arrival",
    completed: false,
  },
  {
    id: "step-2",
    title: "Check passport validity",
    description: "Your passport must be valid for at least 6 months past your arrival date.",
    deadline: "Before you apply",
    completed: true,
  },
  {
    id: "step-3",
    title: "Get travel insurance",
    description: "Some destinations require proof of travel insurance at entry.",
    deadline: "Before departure",
    completed: false,
  },
];

export default function App() {
  const { user } = useAuth();

  // Bridges ChecklistPage's local toggle state to the two Firestore
  // fields DashboardPage's Progress card (useChecklistProgress) actually
  // reads. Lives here rather than inside ChecklistPage so that component
  // stays decoupled from Firestore entirely, per its own design.
  async function handleChecklistToggle(completedCount, total) {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        { checklistCompleted: completedCount, checklistTotal: total },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to save checklist progress:", err);
    }
  }

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
          <Route
            path="/visa-comparison"
            element={
              <ProtectedRoute>
                <VisaComparisonPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cost-of-living"
            element={
              <ProtectedRoute>
                <CostOfLivingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <DocumentUploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <AccountPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checklist"
            element={
              <ProtectedRoute>
                <ChecklistPage
                steps={sampleChecklistSteps}
                isLoading={false}
                error={null}
                onToggleStep={handleChecklistToggle}
              />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
