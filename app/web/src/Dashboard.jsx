import React, { useState, useEffect } from 'react';
import { db } from './firebase'; 
import { collection, onSnapshot, query, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import './Dashboard.css';

function Dashboard({ alSalir }) {
  const [seccionActiva, setSeccionActiva] = useState('Todas las Minutas');
  const [minutasDatos, setMinutasDatos] = useState([]); 
  const [usuariosDatos, setUsuariosDatos] = useState([]); 

  // Filtros de búsqueda
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('');

  // Formulario de nuevo usuario (Añadido estado de contraseña)
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRol, setNuevoRol] = useState('Vendedor');
  const [nuevaContrasena, setNuevaContrasena] = useState('');

  const [minutaSeleccionada, setMinutaSeleccionada] = useState(null);

  useEffect(() => {
    // Escucha de Minutas
    const qMinutas = query(collection(db, "minutas"));
    const unsubMinutas = onSnapshot(qMinutas, (snapshot) => {
      const datos = snapshot.docs.map(doc => {
        const data = doc.data();
        let tareas = [];
        if (data.actividades) {
          if (data.actividades.talachear) tareas.push("Talacha");
          if (data.actividades.recolectarDesecho) tareas.push("Rec. Desecho");
          if (data.actividades.recolectarRenovado) tareas.push("Rec. Renovado");
          if (data.actividades.semaforear) tareas.push("Semaforeo");
        }
        return {
          id: doc.id,
          cliente: data.cliente || "Sin Cliente",
          vendedor: data.vendedor || "No asignado",
          fecha: data.fecha || "---",
          hora: data.hora || "---",
          detalles: data.detalles || "Sin detalles adicionales",
          actividadesTexto: tareas.join(", ") || "Ninguna",
          estatus: data.estatus || "Pendiente" 
        };
      });
      setMinutasDatos(datos);
    });

    // Escucha de Usuarios
    const qUsuarios = query(collection(db, "usuarios"));
    const unsubUsuarios = onSnapshot(qUsuarios, (snapshot) => {
      const datosUser = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsuariosDatos(datosUser);
    });

    return () => {
      unsubMinutas();
      unsubUsuarios();
    };
  }, []);

  const validarMinuta = async (id) => {
    try {
      const minutaRef = doc(db, "minutas", id);
      await updateDoc(minutaRef, { estatus: "Autorizado" });
      if (minutaSeleccionada && minutaSeleccionada.id === id) {
        setMinutaSeleccionada(prev => ({ ...prev, estatus: "Autorizado" }));
      }
      alert("Minuta validada correctamente.");
    } catch (error) {
      console.error("Error al validar:", error);
    }
  };

  // Función modificada para incluir contraseña
  const crearUsuario = async (e) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) return alert("Escribe el nombre del usuario");
    if (!nuevaContrasena.trim()) return alert("Asigna una contraseña para el usuario");
    if (nuevaContrasena.length < 4) return alert("La contraseña debe tener al menos 4 caracteres");

    try {
      await addDoc(collection(db, "usuarios"), {
        nombre: nuevoNombre.trim(),
        rol: nuevoRol,
        contrasena: nuevaContrasena.trim(), // Se guarda junto con el perfil
        fechaAlta: new Date().toLocaleDateString()
      });
      setNuevoNombre('');
      setNuevaContrasena('');
      alert("Usuario registrado con éxito.");
    } catch (error) {
      console.error("Error al crear usuario:", error);
    }
  };

  const eliminarUsuario = async (id, nombre) => {
    if (window.confirm(`¿Estás seguro de que deseas dar de baja a ${nombre}?`)) {
      try {
        await deleteDoc(doc(db, "usuarios", id));
        alert("Usuario eliminado.");
      } catch (error) {
        console.error("Error:", error);
      }
    }
  };

  const minutasFiltradas = minutasDatos.filter(minuta => {
    if (seccionActiva === 'Pendientes de Revisión' && minuta.estatus !== 'Pendiente') return false;
    if (seccionActiva === 'Historial Autorizado' && minuta.estatus !== 'Autorizado') return false;
    
    const cumpleCliente = minuta.cliente.toLowerCase().includes(filtroCliente.toLowerCase());
    const cumpleVendedor = minuta.vendedor.toLowerCase().includes(filtroVendedor.toLowerCase());
    return cumpleCliente && cumpleVendedor;
  });

  return (
    <div className="dashboard-container">
      {/* Barra Lateral */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span>SAGO DASHBOARD</span>
        </div>
        <ul className="menu-list">
          <li className={`menu-item ${seccionActiva === 'Todas las Minutas' ? 'active' : ''}`} onClick={() => setSeccionActiva('Todas las Minutas')}>
            Todas las Minutas
          </li>
          <li className={`menu-item ${seccionActiva === 'Pendientes de Revisión' ? 'active' : ''}`} onClick={() => setSeccionActiva('Pendientes de Revisión')}>
            Pendientes de Revisión
          </li>
          <li className={`menu-item ${seccionActiva === 'Historial Autorizado' ? 'active' : ''}`} onClick={() => setSeccionActiva('Historial Autorizado')}>
            Historial Autorizado
          </li>
          <li className={`menu-item ${seccionActiva === 'Control de Usuarios' ? 'active' : ''}`} onClick={() => setSeccionActiva('Control de Usuarios')} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '15px', paddingTop: '15px' }}>
            ⚙️ Control de Usuarios
          </li>
          <li className="menu-item" onClick={alSalir} style={{ marginTop: 'auto', color: '#8B141A' }}>
            Cerrar Sesión
          </li>
        </ul>
      </aside>

      {/* Contenido Principal */}
      <main className="main-content">
        <header className="header-panel">
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem' }}>{seccionActiva}</h1>
            <p style={{ margin: '5px 0 0 0', color: '#888e93' }}>
              {seccionActiva === 'Control de Usuarios' ? 'Administración de personal' : 'Control y validación de reportes de llantas'}
            </p>
          </div>
        </header>

        {seccionActiva === 'Control de Usuarios' ? (
          /* CONTROL DE USUARIOS (FORMULARIO ACTUALIZADO) */
          <div style={{ display: 'flex', gap: '30px', flexDirection: 'row', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '300px', background: '#171a1c', padding: '25px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)', height: 'fit-content' }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#ffffff' }}>Registrar Nuevo Personal</h3>
              <form onSubmit={crearUsuario}>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', color: '#888e93', fontSize: '0.85rem', marginBottom: '5px' }}>Nombre Completo:</label>
                  <input type="text" placeholder="Ej. Juan Pérez" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#111315', color: '#ffffff', boxSizing: 'border-box' }} />
                </div>
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', color: '#888e93', fontSize: '0.85rem', marginBottom: '5px' }}>Contraseña de Acceso:</label>
                  <input type="password" placeholder="Mínimo 4 caracteres" value={nuevaContrasena} onChange={(e) => setNuevaContrasena(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#111315', color: '#ffffff', boxSizing: 'border-box' }} />
                </div>

                <div style={{ marginBottom: '25px' }}>
                  <label style={{ display: 'block', color: '#888e93', fontSize: '0.85rem', marginBottom: '5px' }}>Rol Asignado:</label>
                  <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#111315', color: '#ffffff', boxSizing: 'border-box' }}>
                    <option value="Vendedor">Vendedor / Operador</option>
                    <option value="Gerente">Gerente / Administrador</option>
                  </select>
                </div>
                <button type="submit" className="action-btn" style={{ width: '100%', padding: '12px', backgroundColor: '#8B141A', border: 'none', fontWeight: '600' }}>Autorizar Acceso</button>
              </form>
            </div>

            <div className="table-container" style={{ flex: '2', minWidth: '450px', margin: 0 }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#ffffff' }}>Personal Activo</h3>
              <table className="sago-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Fecha de Alta</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosDatos.length === 0 ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', color: '#888e93', padding: '20px' }}>No hay usuarios registrados.</td></tr>
                  ) : (
                    usuariosDatos.map(user => (
                      <tr key={user.id}>
                        <td style={{ fontWeight: '600' }}>{user.nombre}</td>
                        <td><span className="badge autorizado" style={{ color: user.rol === 'Gerente' ? '#d4af37' : '#28a745' }}>{user.rol}</span></td>
                        <td style={{ color: '#888e93' }}>{user.fechaAlta}</td>
                        <td><button className="action-btn" style={{ borderColor: '#8B141A', color: '#E21C24' }} onClick={() => eliminarUsuario(user.id, user.nombre)}>Dar de Baja</button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* TABLA DE MINUTAS */
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <span style={{ color: '#888e93' }}>Minutas Mostradas</span>
                <div className="stat-value" style={{ color: '#ffffff' }}>{minutasFiltradas.length}</div>
              </div>
              <div className="stat-card">
                <span style={{ color: '#888e93' }}>Por Autorizar (Total)</span>
                <div className="stat-value" style={{ color: '#E21C24' }}>{minutasDatos.filter(m => m.estatus === 'Pendiente').length}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: '#171a1c', padding: '15px 20px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#888e93', fontSize: '0.85rem', marginBottom: '5px' }}>Buscar por Empresa:</label>
                <input type="text" placeholder="Ej. Transportes JUSA..." value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#111315', color: '#ffffff', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#888e93', fontSize: '0.85rem', marginBottom: '5px' }}>Buscar por Trabajador:</label>
                <input type="text" placeholder="Ej. Bryan Hernandez..." value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#111315', color: '#ffffff', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div className="table-container">
              <table className="sago-table">
                <thead>
                  <tr>
                    <th>Fecha/Hora</th>
                    <th>Cliente</th>
                    <th>Operador/Vendedor</th>
                    <th>Actividades</th>
                    <th>Detalles</th>
                    <th>Estatus</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {minutasFiltradas.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', color: '#888e93', padding: '30px' }}>No hay minutas.</td></tr>
                  ) : (
                    minutasFiltradas.map((minuta) => (
                      <tr key={minuta.id}>
                        <td>
                          <div style={{ fontSize: '0.95rem' }}>{minuta.fecha}</div>
                          <div style={{ fontSize: '0.8rem', color: '#888e93' }}>{minuta.hora}</div>
                        </td>
                        <td style={{ fontWeight: '600' }}>{minuta.cliente}</td>
                        <td>{minuta.vendedor}</td>
                        <td style={{ color: '#d4af37', fontSize: '0.9rem' }}>{minuta.actividadesTexto}</td>
                        <td style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {minuta.detalles}
                        </td>
                        <td><span className={`badge ${minuta.estatus.toLowerCase()}`}>{minuta.estatus}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="action-btn" onClick={() => setMinutaSeleccionada(minuta)}>
                              Ver info
                            </button>
                            {minuta.estatus === 'Pendiente' ? (
                              <button className="action-btn" style={{ backgroundColor: '#8B141A', borderColor: '#8B141A' }} onClick={() => validarMinuta(minuta.id)}>Validar</button>
                            ) : (
                              <span style={{ color: '#28a745', fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>✓ Listo</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* MODAL DETALLES */}
        {minutaSeleccionada && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: '#171a1c', border: '1px solid rgba(255,255,255,0.08)', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '550px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', color: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '15px' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Resumen Completo de la Minuta</h2>
                <button onClick={() => setMinutaSeleccionada(null)} style={{ background: 'transparent', border: 'none', color: '#888e93', fontSize: '1.5rem', cursor: 'pointer', marginLeft: 'auto' }}>&times;</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <label style={{ color: '#888e93', fontSize: '0.85rem' }}>Cliente / Empresa</label>
                  <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', fontSize: '1.1rem' }}>{minutaSeleccionada.cliente}</p>
                </div>
                <div>
                  <label style={{ color: '#888e93', fontSize: '0.85rem' }}>Estatus del Reporte</label>
                  <div style={{ marginTop: '5px' }}>
                    <span className={`badge ${minutaSeleccionada.estatus.toLowerCase()}`}>{minutaSeleccionada.estatus}</span>
                  </div>
                </div>
                <div>
                  <label style={{ color: '#888e93', fontSize: '0.85rem' }}>Registrado Por</label>
                  <p style={{ margin: '5px 0 0 0', color: '#ffffff' }}>{minutaSeleccionada.vendedor}</p>
                </div>
                <div>
                  <label style={{ color: '#888e93', fontSize: '0.85rem' }}>Fecha y Hora</label>
                  <p style={{ margin: '5px 0 0 0', color: '#ffffff' }}>{minutaSeleccionada.fecha} a las {minutaSeleccionada.hora}</p>
                </div>
              </div>
              <div style={{ marginBottom: '20px', background: '#111315', padding: '12px', borderRadius: '6px' }}>
                <label style={{ color: '#888e93', fontSize: '0.85rem' }}>Actividades en Llantas</label>
                <p style={{ margin: '5px 0 0 0', color: '#d4af37', fontWeight: '500' }}>{minutaSeleccionada.actividadesTexto}</p>
              </div>
              <div style={{ marginBottom: '25px' }}>
                <label style={{ color: '#888e93', fontSize: '0.85rem' }}>Detalles Completos de Inspección</label>
                <div style={{ margin: '5px 0 0 0', color: '#ffffff', background: '#111315', padding: '15px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)', lineHeight: '1.5', maxHeight: '150px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                  {minutaSeleccionada.detalles}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'end' }}>
                <button className="action-btn" onClick={() => setMinutaSeleccionada(null)}>Cerrar Ventana</button>
                {minutaSeleccionada.estatus === 'Pendiente' && (
                  <button className="action-btn" style={{ backgroundColor: '#28a745', borderColor: '#28a745' }} onClick={() => validarMinuta(minutaSeleccionada.id)}>Validar Reporte</button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Dashboard;