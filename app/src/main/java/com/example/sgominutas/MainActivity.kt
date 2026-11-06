package com.example.sgominutas

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.sgominutas.uisago.screens.PantallaDiseñoSAGO
import com.google.firebase.auth.FirebaseAuth // <--- Importante para checar la sesión

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background
            ) {
                val navController = rememberNavController()

                // 1. Verificamos si hay una sesión activa en el teléfono
                val usuarioActual = FirebaseAuth.getInstance().currentUser

                // 2. Si existe el usuario va a la minuta, si es null va al login
                val rutaInicial = if (usuarioActual != null) "minuta" else "login"

                NavHost(
                    navController = navController,
                    startDestination = rutaInicial // <--- Arranca de forma dinámica
                ) {
                    composable("login") {
                        PantallaLoginSAGO(onLoginSuccess = {
                            navController.navigate("minuta") {
                                popUpTo("login") { inclusive = true }
                            }
                        })
                    }

                    composable("minuta") {
                        PantallaDiseñoSAGO()
                    }
                }
            }
        }
    }
}