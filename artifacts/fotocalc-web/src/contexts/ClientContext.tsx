import React, { createContext, useContext, useState } from "react";

export interface ClientData {
  name: string;
  address: string;
  nif: string;
  email: string;
  phone: string;
}

interface ClientContextType {
  client: ClientData;
  setClient: React.Dispatch<React.SetStateAction<ClientData>>;
}

const defaultClient: ClientData = {
  name: "",
  address: "",
  nif: "",
  email: "",
  phone: "",
};

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<ClientData>(defaultClient);

  return (
    <ClientContext.Provider value={{ client, setClient }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const context = useContext(ClientContext);
  if (context === undefined) {
    throw new Error("useClient must be used within a ClientProvider");
  }
  return context;
}
