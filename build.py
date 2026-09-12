import os
import subprocess
import sys

def main():
    print("========================================")
    print("🛠️  DiskScanner Turbo - Compilador  🛠️")
    print("========================================")
    print("\nVerificando requisitos...")
    
    try:
        import PyInstaller
    except ImportError:
        print("PyInstaller no está instalado. Instalándolo ahora...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
        
    print("\nIniciando compilación del ejecutable...")
    print("Esto puede tardar unos minutos. Por favor espera...\n")
    
    # Construir el comando de PyInstaller
    command = [
        "pyinstaller",
        "--noconsole",           # No mostrar ventana CMD negra de fondo
        "--onefile",             # Empaquetar todo en un solo archivo .exe
        "--name", "DiskScanner_Turbo_Ultimate", # Nombre del ejecutable
        "--add-data", "templates;templates",    # Empaquetar la carpeta templates
        "--add-data", "static;static",          # Empaquetar la carpeta static
        "--clean",               # Limpiar caché de compilaciones anteriores
        "main.py"                # El archivo principal (lanza pywebview, no el server Flask solo)
    ]
    
    try:
        # Ejecutar el comando
        subprocess.check_call(command)
        
        print("\n✅ ¡COMPILACIÓN EXITOSA!")
        print("Tu aplicación está lista en la carpeta 'dist'.")
        print("Ruta: dist/DiskScanner_Turbo_Ultimate.exe")
        
        # Limpiar archivos basura de compilación (.spec y build/)
        try:
            os.remove("DiskScanner_Turbo_Ultimate.spec")
            import shutil
            shutil.rmtree("build")
            print("🧹 Archivos temporales limpiados.")
        except:
            pass
            
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Error durante la compilación: {e}")
        
    print("\nPresiona ENTER para salir...")
    input()

if __name__ == "__main__":
    main()
