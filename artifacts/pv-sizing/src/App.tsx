import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

// Pages
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers";
import CustomerDetail from "@/pages/customer-detail";
import Panels from "@/pages/panels";
import Inverters from "@/pages/inverters";
import Batteries from "@/pages/batteries";
import Systems from "@/pages/systems";
import SystemNew from "@/pages/system-new";
import SystemDetail from "@/pages/system-detail";
import StringSizing from "@/pages/string-sizing";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/clientes" component={Customers} />
        <Route path="/clientes/:id" component={CustomerDetail} />
        <Route path="/equipamentos/paineis" component={Panels} />
        <Route path="/equipamentos/inversores" component={Inverters} />
        <Route path="/equipamentos/baterias" component={Batteries} />
        <Route path="/sistemas" component={Systems} />
        <Route path="/sistemas/novo" component={SystemNew} />
        <Route path="/sistemas/:id" component={SystemDetail} />
        <Route path="/calculadora-strings" component={StringSizing} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
