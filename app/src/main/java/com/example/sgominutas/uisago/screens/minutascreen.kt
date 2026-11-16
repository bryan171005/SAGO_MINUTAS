package com.example.sgominutas.uisago.screens

import android.Manifest
import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.launch
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.sgominutas.services.LocationHelper
import com.example.sgominutas.services.UbicacionMinuta
import com.google.firebase.firestore.FirebaseFirestore
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaDiseñoSAGO() {
    val contexto = LocalContext.current
    val db = remember { FirebaseFirestore.getInstance() }

    // Recuperamos el nombre del usuario logueado desde SharedPreferences
    val sharedPref = remember { contexto.getSharedPreferences("SAGO_PREFS", Context.MODE_PRIVATE) }
    val vendedorAutenticado = remember { sharedPref.getString("usuario_activo", "Operador Desconocido") ?: "Operador Desconocido" }

    // Estado dinámico para la lista de clientes obtenida de Firestore
    var listaClientes by remember { mutableStateOf<List<String>>(emptyList()) }
    var cargandoClientes by remember { mutableStateOf(true) }

    // Cargar clientes en tiempo real desde la colección "clientes" en Firestore
    DisposableEffect(Unit) {
        val listener = db.collection("clientes")
            .whereEqualTo("activo", true)
            .addSnapshotListener { snapshot, error ->
                cargandoClientes = false
                if (error != null) {
                    Toast.makeText(contexto, "Error al cargar clientes: ${error.message}", Toast.LENGTH_SHORT).show()
                    return@addSnapshotListener
                }

                if (snapshot != null && !snapshot.isEmpty) {
                    listaClientes = snapshot.documents.mapNotNull { doc ->
                        doc.getString("nombreEmpresa")
                    }.sorted()
                } else {
                    listaClientes = emptyList()
                }
            }

        onDispose {
            listener.remove()
        }
    }

    // Estados para controlar qué opción está seleccionada
    var clienteSeleccionado by remember { mutableStateOf("") }
    var notasDelDia by remember { mutableStateOf("") }
    var cargando by remember { mutableStateOf(false) }

    // Estados para controlar si el menú desplegable está abierto o cerrado
    var menuClientesExpandido by remember { mutableStateOf(false) }

    // Estados para las actividades
    var actTalachear by remember { mutableStateOf(false) }
    var actSemaforear by remember { mutableStateOf(false) }
    var actRecolectarDesecho by remember { mutableStateOf(false) }
    var actRecolectarRenovado by remember { mutableStateOf(false) }

    // Estado para almacenar la fotografía capturada en memoria temporal
    var bitmapFoto by remember { mutableStateOf<Bitmap?>(null) }

    // Lanzador para activar la cámara nativa del dispositivo
    val camaraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            bitmapFoto = bitmap
        }
    }

    // ========================================================================
    // ESTADOS Y LANZADOR DE UBICACIÓN GPS (LocationHelper)
    // ========================================================================
    val locationHelper = remember { LocationHelper(contexto) }
    var ubicacionActual by remember { mutableStateOf(UbicacionMinuta()) }
    var obteniendoUbicacion by remember { mutableStateOf(false) }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            obteniendoUbicacion = true
            locationHelper.obtenerUbicacionActual { resultado ->
                ubicacionActual = resultado
                obteniendoUbicacion = false
                if (resultado.latitud != 0.0) {
                    Toast.makeText(contexto, "Ubicación capturada correctamente", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(contexto, "No se pudo obtener el GPS. Verifica que esté encendido", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            Toast.makeText(contexto, "Permiso de ubicación denegado", Toast.LENGTH_SHORT).show()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8F9FA))
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "SAGO",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Black,
                    color = Color(0xFF1E2225)
                )
                Text(
                    text = "Control de Minutas de Actividades",
                    fontSize = 14.sp,
                    color = Color(0xFF5D6367),
                    fontWeight = FontWeight.Medium
                )
            }
        }

        Divider(color = Color(0xFF9EA3A6).copy(alpha = 0.3f), thickness = 1.dp)

        // ====================================================================
        // IDENTIFICADOR AUTOMÁTICO DE SESIÓN
        // ====================================================================
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFE9ECEF))
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Operador Activo:",
                        fontSize = 12.sp,
                        color = Color(0xFF5D6367),
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = vendedorAutenticado,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF1E2225)
                    )
                }
            }
        }

        // ====================================================================
        // COMBOBOX DINÁMICO DE CLIENTES (DESDE FIRESTORE)
        // ====================================================================
        ExposedDropdownMenuBox(
            expanded = menuClientesExpandido,
            onExpandedChange = {
                if (!cargando && !cargandoClientes) {
                    menuClientesExpandido = !menuClientesExpandido
                }
            }
        ) {
            OutlinedTextField(
                value = if (cargandoClientes) "Cargando clientes..." else clienteSeleccionado,
                onValueChange = {},
                readOnly = true,
                label = { Text("Cliente / Empresa Visitada") },
                trailingIcon = {
                    if (cargandoClientes) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = Color(0xFFE21C24)
                        )
                    } else {
                        ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuClientesExpandido)
                    }
                },
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color(0xFFE21C24),
                    focusedLabelColor = Color(0xFFE21C24),
                    unfocusedBorderColor = Color(0xFF5D6367)
                ),
                enabled = !cargando && !cargandoClientes
            )
            ExposedDropdownMenu(
                expanded = menuClientesExpandido,
                onDismissRequest = { menuClientesExpandido = false }
            ) {
                if (listaClientes.isEmpty()) {
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = "No hay clientes activos registrados",
                                fontSize = 14.sp,
                                color = Color(0xFF5D6367)
                            )
                        },
                        onClick = { menuClientesExpandido = false }
                    )
                } else {
                    listaClientes.forEach { cliente ->
                        DropdownMenuItem(
                            text = { Text(text = cliente, fontSize = 15.sp) },
                            onClick = {
                                clienteSeleccionado = cliente
                                menuClientesExpandido = false
                            }
                        )
                    }
                }
            }
        }

        // SECCIÓN: SELECCIÓN DE ACTIVIDADES REALIZADAS
        Text(
            text = "Actividades Realizadas",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF1E2225)
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White, shape = MaterialTheme.shapes.small)
                .padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(
                    checked = actTalachear,
                    onCheckedChange = { if (!cargando) actTalachear = it },
                    colors = CheckboxDefaults.colors(checkedColor = Color(0xFFE21C24))
                )
                Text(text = "Talachear", color = Color(0xFF1E2225), fontSize = 15.sp)
            }

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(
                    checked = actSemaforear,
                    onCheckedChange = { if (!cargando) actSemaforear = it },
                    colors = CheckboxDefaults.colors(checkedColor = Color(0xFFE21C24))
                )
                Text(text = "Semaforear", color = Color(0xFF1E2225), fontSize = 15.sp)
            }

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(
                    checked = actRecolectarDesecho,
                    onCheckedChange = { if (!cargando) actRecolectarDesecho = it },
                    colors = CheckboxDefaults.colors(checkedColor = Color(0xFFE21C24))
                )
                Text(text = "Recolectar desecho", color = Color(0xFF1E2225), fontSize = 15.sp)
            }

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Checkbox(
                    checked = actRecolectarRenovado,
                    onCheckedChange = { if (!cargando) actRecolectarRenovado = it },
                    colors = CheckboxDefaults.colors(checkedColor = Color(0xFFE21C24))
                )
                Text(text = "Recolectar renovado", color = Color(0xFF1E2225), fontSize = 15.sp)
            }
        }

        OutlinedTextField(
            value = notasDelDia,
            onValueChange = { notasDelDia = it },
            label = { Text("Detalles Adicionales (Minuta)") },
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp),
            maxLines = 5,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color(0xFFE21C24),
                focusedLabelColor = Color(0xFFE21C24),
                unfocusedBorderColor = Color(0xFF5D6367)
            ),
            enabled = !cargando
        )

        // ====================================================================
        // TARJETA DE EVIDENCIA FOTOGRÁFICA INTERACTIVA
        // ====================================================================
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E2225))
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Evidencia Fotográfica",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
                Spacer(modifier = Modifier.height(12.dp))

                if (bitmapFoto != null) {
                    Image(
                        bitmap = bitmapFoto!!.asImageBitmap(),
                        contentDescription = "Foto Evidencia",
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .background(Color.Black),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Text(
                        text = "Ninguna fotografía capturada",
                        color = Color(0xFF9EA3A6),
                        fontSize = 12.sp
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                Button(
                    onClick = { camaraLauncher.launch() },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF5D6367)),
                    enabled = !cargando
                ) {
                    Text(
                        text = if (bitmapFoto != null) "Cambiar Foto" else "Tomar Foto",
                        color = Color.White
                    )
                }
            }
        }

        // ====================================================================
        // TARJETA DE GEOLOCALIZACIÓN GPS DEL LUGAR
        // ====================================================================
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Ubicación de la Visita (GPS)",
                    color = Color(0xFF1E2225),
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = if (ubicacionActual.latitud != 0.0) {
                        "📍 ${ubicacionActual.direccionTexto}\n(${String.format(Locale.US, "%.5f", ubicacionActual.latitud)}, ${String.format(Locale.US, "%.5f", ubicacionActual.longitud)})"
                    } else {
                        "Sin ubicación capturada"
                    },
                    color = if (ubicacionActual.latitud != 0.0) Color(0xFF1E2225) else Color(0xFF5D6367),
                    fontSize = 13.sp
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedButton(
                    onClick = {
                        locationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !cargando && !obteniendoUbicacion
                ) {
                    if (obteniendoUbicacion) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Color(0xFFE21C24)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Obteniendo GPS...", color = Color(0xFF1E2225))
                    } else {
                        Text(
                            text = if (ubicacionActual.latitud != 0.0) "Actualizar Ubicación" else "Capturar Ubicación Actual",
                            color = Color(0xFFE21C24),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // BOTÓN PRINCIPAL ACTUALIZADO CON ENVÍO DE FOTO BASE64 Y UBICACIÓN GPS
        Button(
            onClick = {
                if (clienteSeleccionado.isNotEmpty()) {
                    cargando = true
                    val fechaActual = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date())
                    val horaActual = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())

                    // Convertir Bitmap a Base64 si el operador tomó foto
                    val fotoBase64 = bitmapFoto?.let { bmp ->
                        val outputStream = ByteArrayOutputStream()
                        bmp.compress(Bitmap.CompressFormat.JPEG, 60, outputStream)
                        val bytes = outputStream.toByteArray()
                        "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                    }

                    val datosMinuta = hashMapOf(
                        "vendedor" to vendedorAutenticado,
                        "cliente" to clienteSeleccionado,
                        "detalles" to notasDelDia.trim(),
                        "fecha" to fechaActual,
                        "hora" to horaActual,
                        "estatus" to "Pendiente",
                        "fotoBase64" to fotoBase64,
                        "latitud" to ubicacionActual.latitud,
                        "longitud" to ubicacionActual.longitud,
                        "ubicacionTexto" to ubicacionActual.direccionTexto,
                        "actividades" to hashMapOf(
                            "talachear" to actTalachear,
                            "semaforear" to actSemaforear,
                            "recolectarDesecho" to actRecolectarDesecho,
                            "recolectarRenovado" to actRecolectarRenovado
                        )
                    )

                    db.collection("minutas")
                        .add(datosMinuta)
                        .addOnSuccessListener {
                            cargando = false
                            Toast.makeText(contexto, "Minuta enviada con éxito", Toast.LENGTH_SHORT).show()

                            // Limpieza del formulario
                            clienteSeleccionado = ""
                            notasDelDia = ""
                            actTalachear = false
                            actSemaforear = false
                            actRecolectarDesecho = false
                            actRecolectarRenovado = false
                            bitmapFoto = null
                            ubicacionActual = UbicacionMinuta()
                        }
                        .addOnFailureListener { e ->
                            cargando = false
                            Toast.makeText(contexto, "Error al enviar: ${e.message}", Toast.LENGTH_LONG).show()
                        }
                } else {
                    Toast.makeText(contexto, "Por favor selecciona el Cliente", Toast.LENGTH_SHORT).show()
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF8B141A)),
            enabled = !cargando
        ) {
            if (cargando) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
            } else {
                Text(
                    text = "Guardar y Enviar Minuta",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }
    }
}