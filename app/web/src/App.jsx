import React, { useState } from 'react'; // 1. Importamos el useState para controlar el cambio
import logoSago from './logosago.png'; 
import Dashboard from './Dashboard'; // 2. Importamos tu nuevo panel de minutas

function App() {
  // 3. Creamos la variable de estado para saber si el usuario ya entró
  const [logeado, setLogeado] = useState(false);

  // 4. Si logeado es true, renderizamos el Dashboard directamente
  if (logeado) {
    return <Dashboard alSalir={() => setLogeado(false)} />;
  }

  // 5. Si logeado es false, mostramos la pantalla de bienvenida con el botón
  return (
    <div className="sago-container">
      <div className="sago-card">
        
        <div className="logo-container">
          <div className="logo-glow"></div>
          <img 
            src={logoSago} 
            alt="Logo SAGO" 
            className="sago-logo"
          />
        </div>
        
        <h1 className="sago-title">SAGO</h1>
        <p className="sago-subtitle">Panel Gerencial de Minutas</p>
        
        {/* 6. Le asignamos la función al botón para que cambie el estado a true al hacer clic */}
        <button className="sago-button" onClick={() => setLogeado(true)}>
          Entrar al Sistema
        </button>
      </div>
    </div>
  );
}

export default App;