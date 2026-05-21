import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { Layout } from "@/components/layout";
import CalculatorPage from "@/pages/calculator";
import RoiPage from "@/pages/roi";
import MapaPage from "@/pages/mapa";
import ReportPage from "@/pages/report";
import LoginPage from "@/pages/login";
import CompanySettingsPage from "@/pages/company-settings";

import { PanelProvider } from "@/contexts/PanelContext";
import { SolarProvider } from "@/contexts/SolarContext";
import { RoiProvider } from "@/contexts/RoiContext";
import { MapaProvider } from "@/contexts/MapaContext";
import { ClientProvider } from "@/contexts/ClientContext";

import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import { BrandingProvider } from "@/components/branding-provider";

const queryClient = new QueryClient();

function ProtectedApp() {
  return (
    <ProtectedRoute>
      <Layout>
        <Switch>
          <Route path="/"><Redirect to="/calculator" /></Route>
          <Route path="/calculator" component={CalculatorPage} />
          <Route path="/roi" component={RoiPage} />
          <Route path="/mapa" component={MapaPage} />
          <Route path="/report" component={ReportPage} />
          <Route path="/empresa" component={CompanySettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route component={ProtectedApp} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <BrandingProvider>
              <PanelProvider>
                <SolarProvider>
                  <RoiProvider>
                    <MapaProvider>
                      <ClientProvider>
                        <Router />
                      </ClientProvider>
                    </MapaProvider>
                  </RoiProvider>
                </SolarProvider>
              </PanelProvider>
            </BrandingProvider>
          </AuthProvider>
          <Toaster />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
