-- =====================================================================
-- Pest Control - estructura de la base de datos (MySQL 8)
-- Parte del modelo de las evidencias GA6-220501096-AA2-EV02/EV03 y lo
-- amplía para cubrir todas las pantallas del frontend (pausa, GPS,
-- inventario, facturas, avisos, firmas, fichas de seguridad).
-- Se puede ejecutar varias veces: no borra nada si las tablas ya existen.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS pestcontrol DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE pestcontrol;

-- 1. rol ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rol (
    id_rol      INT AUTO_INCREMENT,
    nombre_rol  VARCHAR(30) NOT NULL,
    PRIMARY KEY (id_rol),
    CONSTRAINT uq_rol_nombre UNIQUE (nombre_rol)
) ENGINE = InnoDB;

-- 2. usuario: cuentas con las que administrador y técnico inician sesión
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario       INT AUTO_INCREMENT,
    nombre_completo  VARCHAR(100) NOT NULL,
    documento        VARCHAR(15) NOT NULL,
    correo           VARCHAR(100) NOT NULL,
    contrasena       VARCHAR(255) NOT NULL,           -- hash bcrypt, nunca el texto
    estado           ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    id_rol           INT NOT NULL,
    PRIMARY KEY (id_usuario),
    CONSTRAINT uq_usuario_correo UNIQUE (correo),
    CONSTRAINT uq_usuario_documento UNIQUE (documento),
    CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
) ENGINE = InnoDB;

-- 3. tecnico: técnico de campo. id_usuario es opcional: el administrador
-- puede registrar un técnico que todavía no tiene cuenta para entrar.
CREATE TABLE IF NOT EXISTS tecnico (
    id_tecnico    INT AUTO_INCREMENT,
    id_usuario    INT NULL,
    nombre        VARCHAR(100) NOT NULL,
    telefono      VARCHAR(15) NULL,
    especialidad  VARCHAR(80) NULL,
    distancia_km  DECIMAL(5,1) NOT NULL DEFAULT 5.0,   -- estimado, lo usa la sugerencia de asignación
    tiempo_min    INT NOT NULL DEFAULT 45,             -- estimado de desplazamiento
    estado        ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    firma_ruta    VARCHAR(255) NULL,                   -- archivo en storage/firmas
    PRIMARY KEY (id_tecnico),
    CONSTRAINT uq_tecnico_usuario UNIQUE (id_usuario),
    CONSTRAINT fk_tecnico_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB;

-- 4. cliente: empresas o personas. Entran con un enlace seguro (token), sin contraseña.
CREATE TABLE IF NOT EXISTS cliente (
    id_cliente      INT AUTO_INCREMENT,
    nombre_empresa  VARCHAR(100) NOT NULL,
    tipo            ENUM('Empresa','Persona natural','Conjunto residencial') NOT NULL DEFAULT 'Empresa',
    documento       VARCHAR(15) NOT NULL,              -- NIT o cédula
    telefono        VARCHAR(15) NULL,
    correo          VARCHAR(100) NOT NULL,
    direccion       VARCHAR(150) NOT NULL,
    token_acceso    VARCHAR(40) NOT NULL,
    PRIMARY KEY (id_cliente),
    CONSTRAINT uq_cliente_documento UNIQUE (documento),
    CONSTRAINT uq_cliente_correo UNIQUE (correo),
    CONSTRAINT uq_cliente_token UNIQUE (token_acceso)
) ENGINE = InnoDB;

-- 5. servicio: la orden de servicio (ODS)
CREATE TABLE IF NOT EXISTS servicio (
    id_servicio           INT AUTO_INCREMENT,
    numero_ods            VARCHAR(20) NOT NULL,
    id_cliente            INT NOT NULL,
    id_tecnico            INT NULL,
    fecha_programada      DATETIME NOT NULL,
    area                  VARCHAR(150) NOT NULL,
    estado                ENUM('pendiente','programado','en_proceso','finalizado','cancelado')
                           NOT NULL DEFAULT 'pendiente',
    observaciones         TEXT NULL,                    -- comentarios del administrador
    incidencias           TEXT NULL,                    -- las escribe el técnico
    notas_tecnicas        TEXT NULL,
    nota_cliente          TEXT NULL,                    -- recomendaciones para el cliente
    fecha_ejecucion       DATETIME NULL,                -- hora de inicio real
    fecha_fin             DATETIME NULL,
    gps_lat               DECIMAL(9,5) NULL,
    gps_lon               DECIMAL(9,5) NULL,
    gps_precision         INT NULL,
    gps_prueba            TINYINT(1) NOT NULL DEFAULT 0,
    segundos_acumulados   INT NOT NULL DEFAULT 0,       -- tiempo trabajado sin contar el tramo en curso
    reanudado_en          DATETIME NULL,                -- inicio del tramo en curso (NULL si está en pausa)
    pausado               TINYINT(1) NOT NULL DEFAULT 0,
    inventario_descontado TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_servicio),
    CONSTRAINT uq_servicio_ods UNIQUE (numero_ods),
    CONSTRAINT fk_servicio_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_servicio_tecnico FOREIGN KEY (id_tecnico) REFERENCES tecnico(id_tecnico)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_servicio_fecha (fecha_programada),
    INDEX idx_servicio_estado (estado)
) ENGINE = InnoDB;

-- 6. servicio_item: servicios a realizar dentro de la orden (uno o varios)
CREATE TABLE IF NOT EXISTS servicio_item (
    id_item      INT AUTO_INCREMENT,
    id_servicio  INT NOT NULL,
    posicion     TINYINT NOT NULL,
    nombre       VARCHAR(80) NOT NULL,
    realizado    TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id_item),
    CONSTRAINT uq_item_posicion UNIQUE (id_servicio, posicion),
    CONSTRAINT fk_item_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

-- 7. producto: insumos y productos químicos
CREATE TABLE IF NOT EXISTS producto (
    id_producto       INT AUTO_INCREMENT,
    nombre            VARCHAR(80) NOT NULL,
    tipo              VARCHAR(50) NOT NULL,
    unidad_medida     VARCHAR(20) NOT NULL,             -- L, kg, und, tubos
    stock_disponible  DECIMAL(10,3) NOT NULL DEFAULT 0,
    stock_minimo      DECIMAL(10,3) NOT NULL DEFAULT 0,
    dosis_referencia  VARCHAR(60) NOT NULL DEFAULT '—',
    ficha_nombre      VARCHAR(150) NULL,                -- ficha de seguridad (PDF)
    ficha_ruta        VARCHAR(255) NULL,
    ficha_tamano      INT NULL,
    PRIMARY KEY (id_producto),
    CONSTRAINT uq_producto_nombre UNIQUE (nombre),
    CONSTRAINT ck_producto_stock CHECK (stock_disponible >= 0),
    CONSTRAINT ck_producto_minimo CHECK (stock_minimo >= 0)
) ENGINE = InnoDB;

-- 8. servicio_producto: productos asignados a la orden (N:M) con dosis,
-- cantidad y la trazabilidad que registra el técnico (lote, zona, especie)
CREATE TABLE IF NOT EXISTS servicio_producto (
    id_servicio         INT NOT NULL,
    id_producto         INT NOT NULL,
    posicion            TINYINT NOT NULL DEFAULT 0,
    dosis_valor         DECIMAL(10,3) NOT NULL,
    dosis_unidad        VARCHAR(30) NOT NULL,
    usado_valor         DECIMAL(10,3) NOT NULL,
    usado_unidad        VARCHAR(10) NOT NULL,
    cantidad_utilizada  DECIMAL(10,3) NOT NULL,          -- usado_valor convertido a la unidad del inventario
    lote                VARCHAR(40) NULL,
    zona                VARCHAR(150) NULL,
    especie             VARCHAR(100) NULL,
    PRIMARY KEY (id_servicio, id_producto),
    CONSTRAINT fk_servprod_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_servprod_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT ck_servprod_cantidad CHECK (cantidad_utilizada > 0)
) ENGINE = InnoDB;

-- 9. evidencia_fotografica: fotos que el técnico adjunta a la orden
CREATE TABLE IF NOT EXISTS evidencia_fotografica (
    id_evidencia   INT AUTO_INCREMENT,
    id_servicio    INT NOT NULL,
    url_imagen     VARCHAR(255) NOT NULL,                -- archivo en storage/evidencias
    fecha_captura  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_evidencia),
    CONSTRAINT fk_evidencia_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

-- 10. certificado: se genera al finalizar (1 a 1 con servicio)
CREATE TABLE IF NOT EXISTS certificado (
    id_certificado      INT AUTO_INCREMENT,
    id_servicio         INT NOT NULL,
    fecha_emision       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    nombre_firmante     VARCHAR(100) NOT NULL,
    documento_firmante  VARCHAR(20) NOT NULL,
    firma_cliente_ruta  VARCHAR(255) NULL,
    firma_tecnico_ruta  VARCHAR(255) NULL,               -- copia de la firma del técnico al cerrar
    correo_destino      VARCHAR(255) NULL,
    estado              ENUM('generado','enviado') NOT NULL DEFAULT 'generado',
    PRIMARY KEY (id_certificado),
    CONSTRAINT uq_certificado_servicio UNIQUE (id_servicio),
    CONSTRAINT fk_certificado_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

-- 11. movimiento_inventario: entradas (+) y consumos (−) de cada producto
CREATE TABLE IF NOT EXISTS movimiento_inventario (
    id_movimiento  INT AUTO_INCREMENT,
    id_producto    INT NOT NULL,
    id_servicio    INT NULL,
    cantidad       DECIMAL(10,3) NOT NULL,
    detalle        VARCHAR(150) NOT NULL,
    tecnico        VARCHAR(100) NULL,
    fecha          DATE NOT NULL,
    PRIMARY KEY (id_movimiento),
    CONSTRAINT fk_mov_producto FOREIGN KEY (id_producto) REFERENCES producto(id_producto)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_mov_servicio FOREIGN KEY (id_servicio) REFERENCES servicio(id_servicio)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB;

-- 12. factura: se muestran en el portal del cliente
CREATE TABLE IF NOT EXISTS factura (
    id_factura  INT AUTO_INCREMENT,
    numero      VARCHAR(20) NOT NULL,
    id_cliente  INT NOT NULL,
    fecha       DATE NOT NULL,
    concepto    VARCHAR(150) NOT NULL,
    valor       DECIMAL(12,2) NOT NULL,
    estado      ENUM('Pagada','Pendiente','Vencida') NOT NULL DEFAULT 'Pendiente',
    PRIMARY KEY (id_factura),
    CONSTRAINT uq_factura_numero UNIQUE (numero),
    CONSTRAINT fk_factura_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT ck_factura_valor CHECK (valor >= 0)
) ENGINE = InnoDB;

-- 13. aviso: notificaciones del portal del cliente
CREATE TABLE IF NOT EXISTS aviso (
    id_aviso    INT AUTO_INCREMENT,
    id_cliente  INT NOT NULL,
    fecha       DATE NOT NULL,
    titulo      VARCHAR(100) NOT NULL,
    texto       VARCHAR(500) NOT NULL,
    PRIMARY KEY (id_aviso),
    CONSTRAINT fk_aviso_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

-- 14. cliente_zona: zonas del lugar del cliente (cocina, bodega...). Las crea el técnico
-- durante la visita y quedan guardadas para las siguientes órdenes del mismo cliente.
CREATE TABLE IF NOT EXISTS cliente_zona (
    id_zona     INT AUTO_INCREMENT,
    id_cliente  INT NOT NULL,
    nombre      VARCHAR(60) NOT NULL,
    PRIMARY KEY (id_zona),
    CONSTRAINT uq_zona_cliente UNIQUE (id_cliente, nombre),
    CONSTRAINT fk_zona_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;
