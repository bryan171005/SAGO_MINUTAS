package com.example.sgominutas

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.firestore.FirebaseFirestore

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PantallaLoginSAGO(onLoginSuccess: () -> Unit) {
    val context = LocalContext.current
    val db = FirebaseFirestore.getInstance()

    var nombreUsuario by remember { mutableStateOf("") }
    var contrasena by remember { mutableStateOf("") }
    var cargando by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8F9FA))
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Image(
            painter = painterResource(id = R.drawable.sagologo),
            contentDescription = "SAGO",
            modifier = Modifier.size(100.dp)
        )

        Text(
            text = "SAGO",
            fontSize = 42.sp,
            fontWeight = FontWeight.Black,
            color = Color(0xFF1E2225)
        )

        Text(
            text = "Sistema de Monitoreo Comercial",
            fontSize = 14.sp,
            color = Color(0xFF5D6367),
            fontWeight = FontWeight.Medium
        )

        Spacer(modifier = Modifier.height(40.dp))

        Text(
            text = "Iniciar Sesión",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF1E2225),
            modifier = Modifier.align(Alignment.Start)
        )

        Text(
            text = "Ingresa tus credenciales de empleado",
            fontSize = 14.sp,
            color = Color(0xFF9EA3A6),
            modifier = Modifier
                .align(Alignment.Start)
                .padding(bottom = 16.dp)
        )

        // CAMPO: NOMBRE COMPLETO
        OutlinedTextField(
            value = nombreUsuario,
            onValueChange = { nombreUsuario = it },
            label = { Text("Nombre Completo") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color(0xFFE21C24),
                focusedLabelColor = Color(0xFFE21C24),
                unfocusedBorderColor = Color(0xFF5D6367)
            ),
            enabled = !cargando
        )

        Spacer(modifier = Modifier.height(12.dp))

        // CAMPO: CONTRASEÑA
        OutlinedTextField(
            value = contrasena,
            onValueChange = { contrasena = it },
            label = { Text("Contraseña") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Color(0xFFE21C24),
                focusedLabelColor = Color(0xFFE21C24),
                unfocusedBorderColor = Color(0xFF5D6367)
            ),
            enabled = !cargando
        )

        Spacer(modifier = Modifier.height(24.dp))

        // BOTÓN DE ACCESO PRINCIPAL
        Button(
            onClick = {
                val userTxt = nombreUsuario.trim()
                val passTxt = contrasena.trim()

                if (userTxt.isEmpty() || passTxt.isEmpty()) {
                    Toast.makeText(context, "Por favor llena todos los campos", Toast.LENGTH_SHORT).show()
                    return@Button
                }

                cargando = true

                // Consulta buscando por coincidencia de nombre en la colección "usuarios"
                db.collection("usuarios")
                    .whereEqualTo("nombre", userTxt)
                    .get()
                    .addOnSuccessListener { snapshot ->
                        cargando = false
                        if (snapshot != null && !snapshot.isEmpty) {
                            val document = snapshot.documents.first()
                            val passGuardada = document.getString("contrasena")

                            if (passGuardada == passTxt) {
                                // Guardar la sesión localmente en las SharedPreferences
                                val sharedPref = context.getSharedPreferences("SAGO_PREFS", Context.MODE_PRIVATE)
                                with(sharedPref.edit()) {
                                    putString("usuario_activo", userTxt)
                                    apply()
                                }

                                Toast.makeText(context, "¡Bienvenido, $userTxt!", Toast.LENGTH_SHORT).show()
                                onLoginSuccess()
                            } else {
                                Toast.makeText(context, "Contraseña incorrecta", Toast.LENGTH_LONG).show()
                            }
                        } else {
                            Toast.makeText(context, "El usuario '$userTxt' no fue encontrado", Toast.LENGTH_LONG).show()
                        }
                    }
                    .addOnFailureListener { e ->
                        cargando = false
                        Toast.makeText(context, "Error en Firestore: ${e.message}", Toast.LENGTH_LONG).show()
                    }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color(0xFF8B141A)
            ),
            enabled = !cargando
        ) {
            if (cargando) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
            } else {
                Text(
                    text = "Ingresar al Sistema",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }
    }
}