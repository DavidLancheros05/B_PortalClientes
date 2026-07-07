-- Crear tabla Tipos_documentos
CREATE TABLE Tipos_documentos (
    tipo_id INT PRIMARY KEY IDENTITY(1,1),
    tipo_nombre NVARCHAR(100) NOT NULL,
    tipo_descripcion NVARCHAR(MAX),
    tipo_codigo NVARCHAR(50),
    tipo_activo BIT DEFAULT 1,
    tipo_created_at DATETIME DEFAULT GETDATE(),
    tipo_updated_at DATETIME DEFAULT GETDATE()
);

-- Crear tabla Formulario_tipo_input
CREATE TABLE Formulario_tipo_input (
    tipo_input_id INT PRIMARY KEY IDENTITY(1,1),
    tipo_input_nombre NVARCHAR(100) NOT NULL,
    tipo_input_codigo NVARCHAR(50),
    tipo_input_descripcion NVARCHAR(MAX),
    tipo_input_activo BIT DEFAULT 1,
    tipo_input_created_at DATETIME DEFAULT GETDATE(),
    tipo_input_updated_at DATETIME DEFAULT GETDATE()
);

-- Crear tabla Formulario_versiones
CREATE TABLE Formulario_versiones (
    formulario_version_id INT PRIMARY KEY IDENTITY(1,1),
    formulario_version_nombre NVARCHAR(255) NOT NULL,
    formulario_version_numero NVARCHAR(50),
    formulario_version_descripcion NVARCHAR(MAX),
    formulario_version_activo BIT DEFAULT 1,
    formulario_version_created_at DATETIME DEFAULT GETDATE(),
    formulario_version_updated_at DATETIME DEFAULT GETDATE()
);

-- Crear tabla Formulario_secciones
CREATE TABLE Formulario_secciones (
    seccion_id INT PRIMARY KEY IDENTITY(1,1),
    formulario_version_id INT NOT NULL,
    seccion_nombre NVARCHAR(255) NOT NULL,
    seccion_descripcion NVARCHAR(MAX),
    seccion_posicion INT,
    seccion_activo BIT DEFAULT 1,
    seccion_created_at DATETIME DEFAULT GETDATE(),
    seccion_updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (formulario_version_id) REFERENCES Formulario_versiones(formulario_version_id)
);

-- Crear tabla Formulario_pregunta
CREATE TABLE Formulario_pregunta (
    pregunta_id INT PRIMARY KEY IDENTITY(1,1),
    seccion_id INT NOT NULL,
    tipo_input_id INT NOT NULL,
    pregunta_texto NVARCHAR(MAX) NOT NULL,
    pregunta_descripcion NVARCHAR(MAX),
    pregunta_posicion INT,
    pregunta_requerida BIT DEFAULT 0,
    pregunta_activo BIT DEFAULT 1,
    pregunta_created_at DATETIME DEFAULT GETDATE(),
    pregunta_updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (seccion_id) REFERENCES Formulario_secciones(seccion_id),
    FOREIGN KEY (tipo_input_id) REFERENCES Formulario_tipo_input(tipo_input_id)
);

-- Crear tabla Formulario_pregunta_opcion
CREATE TABLE Formulario_pregunta_opcion (
    opcion_id INT PRIMARY KEY IDENTITY(1,1),
    pregunta_id INT NOT NULL,
    opcion_texto NVARCHAR(255) NOT NULL,
    opcion_valor NVARCHAR(255),
    opcion_posicion INT,
    opcion_activo BIT DEFAULT 1,
    opcion_created_at DATETIME DEFAULT GETDATE(),
    opcion_updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (pregunta_id) REFERENCES Formulario_pregunta(pregunta_id)
);

-- Crear tabla solicitudes
CREATE TABLE solicitudes (
    solicitud_id INT PRIMARY KEY IDENTITY(1,1),
    formulario_version_id INT NOT NULL,
    cliente_id INT,
    sol_codigo NVARCHAR(100),
    sol_estado NVARCHAR(50),
    sol_descripcion NVARCHAR(MAX),
    sol_activo BIT DEFAULT 1,
    sol_created_at DATETIME DEFAULT GETDATE(),
    sol_updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (formulario_version_id) REFERENCES Formulario_versiones(formulario_version_id)
);

-- Crear tabla Solicitud_documento
CREATE TABLE Solicitud_documento (
    documento_id INT PRIMARY KEY IDENTITY(1,1),
    solicitud_id INT NOT NULL,
    tipo_id INT NOT NULL,
    documento_nombre NVARCHAR(255) NOT NULL,
    documento_ruta NVARCHAR(MAX),
    documento_tamaño BIGINT,
    documento_tipo_archivo NVARCHAR(50),
    documento_descripcion NVARCHAR(MAX),
    documento_activo BIT DEFAULT 1,
    documento_created_at DATETIME DEFAULT GETDATE(),
    documento_updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(solicitud_id),
    FOREIGN KEY (tipo_id) REFERENCES Tipos_documentos(tipo_id)
);

-- Crear tabla Formulario_respuesta
CREATE TABLE Formulario_respuesta (
    respuesta_id INT PRIMARY KEY IDENTITY(1,1),
    solicitud_id INT NOT NULL,
    pregunta_id INT NOT NULL,
    respuesta_valor NVARCHAR(MAX),
    respuesta_archivo_ruta NVARCHAR(MAX),
    respuesta_activo BIT DEFAULT 1,
    respuesta_created_at DATETIME DEFAULT GETDATE(),
    respuesta_updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(solicitud_id),
    FOREIGN KEY (pregunta_id) REFERENCES Formulario_pregunta(pregunta_id)
);

-- Crear índices para mejor rendimiento
CREATE INDEX idx_Formulario_secciones_version ON Formulario_secciones(formulario_version_id);
CREATE INDEX idx_Formulario_pregunta_seccion ON Formulario_pregunta(seccion_id);
CREATE INDEX idx_Formulario_pregunta_tipo ON Formulario_pregunta(tipo_input_id);
CREATE INDEX idx_Formulario_pregunta_opcion_pregunta ON Formulario_pregunta_opcion(pregunta_id);
CREATE INDEX idx_solicitudes_version ON solicitudes(formulario_version_id);
CREATE INDEX idx_solicitudes_cliente ON solicitudes(cliente_id);
CREATE INDEX idx_Solicitud_documento_solicitud ON Solicitud_documento(solicitud_id);
CREATE INDEX idx_Solicitud_documento_tipo ON Solicitud_documento(tipo_id);
CREATE INDEX idx_Formulario_respuesta_solicitud ON Formulario_respuesta(solicitud_id);
CREATE INDEX idx_Formulario_respuesta_pregunta ON Formulario_respuesta(pregunta_id);
