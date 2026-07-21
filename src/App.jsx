import { Navigate, Route, Routes } from "react-router-dom";
import VisitorLayout from "./layouts/VisitorLayout.jsx";
import NewVisitorPage from "./pages/NewVisitorPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ReturningVisitorPage from "./pages/ReturningVisitorPage.jsx";
import VisitorLandingPage from "./pages/VisitorLandingPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<VisitorLayout />}>
        <Route index element={<Navigate replace to="/visit" />} />
        <Route path="visit" element={<VisitorLandingPage />} />
        <Route path="visit/new" element={<NewVisitorPage />} />
        <Route path="visit/returning" element={<ReturningVisitorPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
