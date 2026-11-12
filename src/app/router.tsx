import { createBrowserRouter } from 'react-router-dom';
import { WelcomePage } from './WelcomePage';
export const router = createBrowserRouter([
  { path: '/', element: <WelcomePage /> },
  { path: '*', element: <WelcomePage /> },
]);
