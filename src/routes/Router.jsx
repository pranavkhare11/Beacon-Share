import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom'
import Navbar from '../components/layout/Navbar.jsx'
import Footer from '../components/layout/Footer.jsx'
import HomePage from '../pages/Home/HomePage.jsx'
import AboutPage from '../pages/About/AboutPage.jsx'
import ContactPage from '../pages/Contact/ContactPage.jsx'
import FaqPage from '../pages/Faq/FaqPage.jsx'
import PrivacyPage from '../pages/Privacy/PrivacyPage.jsx'
import ReceiverPage from '../pages/Receiver/ReceiverPage.jsx'

function SiteLayout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <SiteLayout />,
      children: [
        {
          index: true,
          element: <HomePage />,
        },
        {
          path: 'receive',
          element: <ReceiverPage />,
        },
        {
          path: 'receive/:urlPeerId',
          element: <ReceiverPage />,
        },
        {
          path: 'about',
          element: <AboutPage />,
        },
        {
          path: 'contact',
          element: <ContactPage />,
        },
        {
          path: 'faq',
          element: <FaqPage />,
        },
        {
          path: 'privacy',
          element: <PrivacyPage />,
        },
      ],
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialRouteTransition: true,
      v7_skipActionErrorRevalidation: true,
    },
  }
)

export default function AppRouter() {
  return (
    <RouterProvider
      router={router}
      future={{
        v7_startTransition: true,
      }}
    />
  )
}
