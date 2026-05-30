
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

import { PanelProvider } from "@/contexts/PanelContext";
import { SolarProvider } from "@/contexts/SolarContext";
import { RoiProvider } from "@/contexts/RoiContext";
import { MapaProvider } from "@/contexts/MapaContext";
import { ClientProvider } from "@/contexts/ClientContext";

import { AuthProvider } from "@/lib/auth";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/calculator" />
      </Route>

      <Route path="/calculator" component={CalculatorPage} />
      <Route path="/dimensionamento" component={CalculatorPage} />
      <Route path="/roi" component={RoiPage} />
      <Route path="/mapa" component={MapaPage} />
      <Route path="/report" component={ReportPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <PanelProvider>
            <SolarProvider>
              <RoiProvider>
                <MapaProvider>
                  <ClientProvider>
                    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                      <Layout>
                        <Router />
                      </Layout>
                    </WouterRouter>

                    <Toaster />
                  </ClientProvider>
                </MapaProvider>
              </RoiProvider>
            </SolarProvider>
          </PanelProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;