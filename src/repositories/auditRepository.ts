import prisma from '../config/prisma';
import { IAudit } from '../interfaces/IAudit';

/**
 * Repositorio para interactuar con los datos de registro de auditoría.
 * Esta clase contiene métodos para crear, recuperar, actualizar y eliminar registros de auditoría en la base de datos.
 */
class AuditLogRepository {

  /**
   * Crea un nuevo registro de auditoría.
   *
   * @param {string} userId - El ID del usuario asociado con el registro de auditoría.
   * @param {string} action - La acción realizada que se está registrando.
   * @param {string} [details] - Detalles opcionales sobre la acción realizada.
   * 
   * @returns {Promise<IAudit>} El registro de auditoría recién creado.
   */
  async createAuditLog(userId: string, action: string, details?: string): Promise<IAudit> {
    return prisma.auditLog.create({
      data: {
        userId,
        action,
        details,
      },
    });
  }

  /**
   * Recupera una lista de registros de auditoría con paginación y un filtro opcional para un usuario específico.
   *
   * @param {number} [page=1] - El número de página para la paginación. Por defecto es 1.
   * @param {number} [limit=10] - El número de registros a recuperar por página. Por defecto es 10.
   * @param {string} [userId] - El ID de usuario opcional para filtrar los registros de auditoría por un usuario específico.
   * 
   * @returns {Promise<IAudit[]>} Una lista de registros de auditoría, potencialmente filtrados por `userId` y paginados.
   */
  async getAuditLogs(page: number = 1, limit: number = 10, userId?: string): Promise<IAudit[]> {
    const validatedPage = Math.max(1, Math.floor(page)); // mínimo 1
    const validatedLimit = Math.max(1, Math.floor(limit)); // mínimo 1

    const skip = (validatedPage - 1) * validatedLimit;

    const whereClause = userId ? { userId } : {};

    return prisma.auditLog.findMany({
      where: whereClause,
      skip,
      take: validatedLimit,
      orderBy: {
        timestamp: 'desc',
      },
    });
  }

  /**
   * Recupera un único registro de auditoría por su ID.
   *
   * @param {string} id - El ID único del registro de auditoría a recuperar.
   * 
   * @returns {Promise<IAudit | null>} El registro de auditoría asociado con el ID especificado o null si no se encuentra.
   */
  async getAuditLogById(id: string): Promise<IAudit | null> {
    return prisma.auditLog.findUnique({
      where: { id },
    });
  }

  /**
   * Actualiza un registro de auditoría existente por su ID.
   *
   * @param {string} id - El ID único del registro de auditoría a actualizar.
   * @param {string} [action] - La nueva acción a establecer para el registro de auditoría.
   * @param {string} [details] - Los nuevos detalles a establecer para el registro de auditoría.
   * 
   * @returns {Promise<IAudit>} El registro de auditoría actualizado.
   */
  async updateAuditLog(id: string, action?: string, details?: string): Promise<IAudit> {
    return prisma.auditLog.update({
      where: { id },
      data: {
        action,
        details,
      },
    });
  }

  /**
   * Elimina un registro de auditoría por su ID.
   *
   * @param {string} id - El ID único del registro de auditoría a eliminar.
   * 
   * @returns {Promise<IAudit>} El resultado de la operación de eliminación.
   */
  async deleteAuditLog(id: string): Promise<IAudit> {
    return prisma.auditLog.delete({
      where: { id },
    });
  }
}

export default new AuditLogRepository();