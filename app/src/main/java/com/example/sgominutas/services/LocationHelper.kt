package com.example.sgominutas.services

import android.annotation.SuppressLint
import android.content.Context
import android.location.Geocoder
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.util.Locale

data class UbicacionMinuta(
    val latitud: Double = 0.0,
    val longitud: Double = 0.0,
    val direccionTexto: String = "Ubicación no disponible"
)

class LocationHelper(private val context: Context) {
    private val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)

    @SuppressLint("MissingPermission")
    fun obtenerUbicacionActual(onResult: (UbicacionMinuta) -> Unit) {
        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { location ->
                if (location != null) {
                    val direccion = obtenerDireccionGratis(location.latitude, location.longitude)
                    onResult(
                        UbicacionMinuta(
                            latitud = location.latitude,
                            longitud = location.longitude,
                            direccionTexto = direccion
                        )
                    )
                } else {
                    onResult(UbicacionMinuta())
                }
            }
            .addOnFailureListener {
                onResult(UbicacionMinuta())
            }
    }

    // Convierte coordenadas a calle/ciudad usando el servicio nativo gratuito de Android
    private fun obtenerDireccionGratis(lat: Double, lon: Double): String {
        return try {
            val geocoder = Geocoder(context, Locale("es", "MX"))
            @Suppress("DEPRECATION")
            val direcciones = geocoder.getFromLocation(lat, lon, 1)
            if (!direcciones.isNullOrEmpty()) {
                val dir = direcciones[0]
                "${dir.thoroughfare ?: ""} ${dir.subThoroughfare ?: ""}, ${dir.locality ?: ""}".trim(',', ' ')
            } else {
                "Lat: $lat, Lon: $lon"
            }
        } catch (e: Exception) {
            "Lat: $lat, Lon: $lon"
        }
    }
}