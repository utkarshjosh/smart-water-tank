import { Navigate } from 'react-router-dom';

// A redirect is not a load. The previous version rendered a full-screen
// "Loading..." heading and redirected from an effect, so every visit to the
// root flashed a loader for one frame before showing the landing page.
export default function Home() {
  return <Navigate to="/welcome" replace />;
}
