import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Home } from '@/pages/Home'
import { Explore } from '@/pages/Explore'
import { CampaignDetail } from '@/pages/CampaignDetail'
import { CreateCampaign } from '@/pages/CreateCampaign'
import { BusinessDashboard } from '@/pages/BusinessDashboard'
import { ManageCampaign } from '@/pages/ManageCampaign'
import { CreatorDashboard } from '@/pages/CreatorDashboard'
import { TrackedLink } from '@/pages/TrackedLink'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/r/:code" element={<TrackedLink />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="explore" element={<Explore />} />
          <Route path="campaign/:id" element={<CampaignDetail />} />
          <Route path="creator" element={<CreatorDashboard />} />
          <Route path="business" element={<BusinessDashboard />} />
          <Route path="business/new" element={<CreateCampaign />} />
          <Route path="business/campaign/:id" element={<ManageCampaign />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
