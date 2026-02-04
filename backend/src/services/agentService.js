/**
 * Service Agent Autonome pour Halimah Pro
 * Permet à Halimah de planifier et exécuter des tâches complexes en plusieurs étapes
 */

import { supabase } from '../config/supabase.js';

// ============================================================
// === ÉTATS DES TÂCHES ===
// ============================================================

export const TASK_STATUS = {
  PENDING: 'pending',        // En attente d'exécution
  RUNNING: 'running',        // En cours d'exécution
  COMPLETED: 'completed',    // Terminée avec succès
  FAILED: 'failed',          // Échouée
  CANCELLED: 'cancelled',    // Annulée
  NEEDS_CONFIRMATION: 'needs_confirmation'  // En attente de confirmation utilisateur
};

// Actions nécessitant une confirmation
const SENSITIVE_ACTIONS = [
  'send_message',          // Envoi de messages
  'social_publish',        // Publication réseaux sociaux
  'gdrive_delete',         // Suppression Google Drive
  'file_delete',           // Suppression fichiers
  'update_rdv',            // Modification RDV
  'comptable_facturation', // Facturation
  'marketing_email',       // Emails marketing
  'marketing_sms'          // SMS marketing
];

// ============================================================
// === GESTION DES TÂCHES ===
// ============================================================

/**
 * Crée une nouvelle tâche
 */
export async function createTask(description, steps = [], parentTaskId = null) {
  try {
    const { data, error } = await supabase
      .from('halimah_tasks')
      .insert({
        parent_task_id: parentTaskId,
        description,
        status: TASK_STATUS.PENDING,
        steps: JSON.stringify(steps),
        current_step: 0
      })
      .select()
      .single();

    if (error) {
      console.error('[AGENT] Erreur création tâche:', error);
      return null;
    }

    console.log(`[AGENT] ✅ Tâche créée #${data.id}: ${description}`);
    return data;
  } catch (err) {
    console.error('[AGENT] Exception createTask:', err);
    return null;
  }
}

/**
 * Récupère une tâche par son ID
 */
export async function getTask(taskId) {
  try {
    const { data, error } = await supabase
      .from('halimah_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) {
      console.error('[AGENT] Erreur getTask:', error);
      return null;
    }

    // Parser les champs JSON
    return {
      ...data,
      steps: data.steps ? JSON.parse(data.steps) : [],
      result: data.result ? JSON.parse(data.result) : null
    };
  } catch (err) {
    console.error('[AGENT] Exception getTask:', err);
    return null;
  }
}

/**
 * Met à jour le statut d'une tâche
 */
export async function updateTaskStatus(taskId, status, result = null, error = null) {
  try {
    const updateData = {
      status,
      ...(result && { result: JSON.stringify(result) }),
      ...(error && { error }),
      ...(status === TASK_STATUS.COMPLETED && { completed_at: new Date().toISOString() })
    };

    const { data, error: updateError } = await supabase
      .from('halimah_tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single();

    if (updateError) {
      console.error('[AGENT] Erreur updateTaskStatus:', updateError);
      return null;
    }

    console.log(`[AGENT] 🔄 Tâche #${taskId} -> ${status}`);
    return data;
  } catch (err) {
    console.error('[AGENT] Exception updateTaskStatus:', err);
    return null;
  }
}

/**
 * Avance à l'étape suivante d'une tâche
 */
export async function advanceTaskStep(taskId, stepResult = null) {
  try {
    const task = await getTask(taskId);
    if (!task) return null;

    const newStep = task.current_step + 1;
    const isComplete = newStep >= task.steps.length;

    // Accumuler les résultats des étapes
    const results = task.result || { steps: [] };
    if (stepResult) {
      results.steps.push({
        step: task.current_step,
        result: stepResult
      });
    }

    const { data, error } = await supabase
      .from('halimah_tasks')
      .update({
        current_step: newStep,
        result: JSON.stringify(results),
        status: isComplete ? TASK_STATUS.COMPLETED : TASK_STATUS.RUNNING,
        ...(isComplete && { completed_at: new Date().toISOString() })
      })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      console.error('[AGENT] Erreur advanceTaskStep:', error);
      return null;
    }

    console.log(`[AGENT] ➡️ Tâche #${taskId} étape ${newStep}/${task.steps.length}`);
    return data;
  } catch (err) {
    console.error('[AGENT] Exception advanceTaskStep:', err);
    return null;
  }
}

/**
 * Récupère les tâches en cours ou en attente
 */
export async function getPendingTasks(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('halimah_tasks')
      .select('*')
      .in('status', [TASK_STATUS.PENDING, TASK_STATUS.RUNNING, TASK_STATUS.NEEDS_CONFIRMATION])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AGENT] Erreur getPendingTasks:', error);
      return [];
    }

    return data.map(task => ({
      ...task,
      steps: task.steps ? JSON.parse(task.steps) : [],
      result: task.result ? JSON.parse(task.result) : null
    }));
  } catch (err) {
    console.error('[AGENT] Exception getPendingTasks:', err);
    return [];
  }
}

/**
 * Annule une tâche
 */
export async function cancelTask(taskId) {
  try {
    const { data, error } = await supabase
      .from('halimah_tasks')
      .update({
        status: TASK_STATUS.CANCELLED,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select()
      .single();

    if (error) {
      console.error('[AGENT] Erreur cancelTask:', error);
      return { success: false, error: error.message };
    }

    console.log(`[AGENT] ❌ Tâche #${taskId} annulée`);
    return { success: true, task: data };
  } catch (err) {
    console.error('[AGENT] Exception cancelTask:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================
// === PLANIFICATION DE TÂCHES ===
// ============================================================

/**
 * Analyse une demande utilisateur et décompose en étapes
 * Retourne un plan d'exécution
 */
export function analyzeAndPlan(userRequest) {
  const request = userRequest.toLowerCase();
  const plan = {
    description: userRequest,
    steps: [],
    requiresConfirmation: false,
    sensitiveSteps: []
  };

  // Patterns de détection pour différents types de tâches

  // === Bilan / Rapport ===
  if (request.includes('bilan') || request.includes('rapport')) {
    plan.steps.push({
      action: 'get_stats',
      params: { periode: 'mois', type: 'all' },
      description: 'Récupérer les statistiques'
    });

    if (request.includes('envo') || request.includes('email')) {
      plan.steps.push({
        action: 'comptable_rapport',
        params: { type_rapport: 'mensuel', format: 'detaille' },
        description: 'Générer le rapport comptable'
      });
      plan.steps.push({
        action: 'send_message',
        params: { canal: 'email', type: 'custom' },
        description: 'Envoyer par email'
      });
      plan.requiresConfirmation = true;
      plan.sensitiveSteps.push(2);
    }
  }

  // === Publication réseaux sociaux ===
  if (request.includes('publi') || request.includes('post')) {
    if (request.includes('image') || request.includes('crée')) {
      plan.steps.push({
        action: 'creer_image',
        params: {},
        description: 'Générer une image'
      });
    }
    plan.steps.push({
      action: 'creer_legende',
      params: {},
      description: 'Créer la légende'
    });
    plan.steps.push({
      action: 'social_publish',
      params: {},
      description: 'Publier sur les réseaux'
    });
    plan.requiresConfirmation = true;
    plan.sensitiveSteps.push(plan.steps.length - 1);
  }

  // === Facturation ===
  if (request.includes('factur')) {
    plan.steps.push({
      action: 'comptable_facturation',
      params: { action: 'creer' },
      description: 'Créer la facture'
    });

    if (request.includes('envo')) {
      plan.steps.push({
        action: 'send_message',
        params: { canal: 'email', type: 'custom' },
        description: 'Envoyer la facture'
      });
      plan.requiresConfirmation = true;
      plan.sensitiveSteps.push(1);
    }
  }

  // === Relance clients ===
  if (request.includes('relanc')) {
    plan.steps.push({
      action: 'commercial_relances',
      params: { type_relance: 'clients_inactifs', action: 'lister' },
      description: 'Identifier les clients à relancer'
    });
    plan.steps.push({
      action: 'marketing_email',
      params: { type: 'reactivation' },
      description: 'Préparer les emails de relance'
    });
    plan.requiresConfirmation = true;
    plan.sensitiveSteps.push(1);
  }

  // === Sauvegarde / Export ===
  if (request.includes('sauvegard') || request.includes('export')) {
    if (request.includes('drive') || request.includes('google')) {
      plan.steps.push({
        action: 'file_list',
        params: { directory: 'exports' },
        description: 'Lister les exports'
      });
      plan.steps.push({
        action: 'gdrive_upload',
        params: {},
        description: 'Uploader vers Google Drive'
      });
    }
  }

  return plan;
}

/**
 * Vérifie si une action nécessite une confirmation
 */
export function requiresConfirmation(actionName) {
  return SENSITIVE_ACTIONS.includes(actionName);
}

/**
 * Formate un plan pour l'affichage à l'utilisateur
 */
export function formatPlanForDisplay(plan) {
  let display = `📋 **Plan d'exécution**\n\n`;
  display += `**Objectif**: ${plan.description}\n\n`;
  display += `**Étapes**:\n`;

  plan.steps.forEach((step, index) => {
    const isSensitive = plan.sensitiveSteps.includes(index);
    const marker = isSensitive ? '⚠️' : '✓';
    display += `${index + 1}. ${marker} ${step.description}\n`;
  });

  if (plan.requiresConfirmation) {
    display += `\n⚠️ **Certaines actions nécessitent ta confirmation** avant exécution.`;
  }

  display += `\n\n**Dois-je exécuter ce plan ?**`;

  return display;
}

// ============================================================
// === EXÉCUTION DE TÂCHES ===
// ============================================================

/**
 * Exécute une étape d'une tâche
 * Retourne le résultat de l'étape ou une demande de confirmation
 */
export async function executeStep(task, stepIndex, executeTool) {
  if (stepIndex >= task.steps.length) {
    return {
      success: true,
      complete: true,
      message: 'Toutes les étapes sont terminées'
    };
  }

  const step = task.steps[stepIndex];

  // Vérifier si cette étape nécessite une confirmation
  if (requiresConfirmation(step.action)) {
    return {
      success: true,
      needsConfirmation: true,
      step: stepIndex,
      action: step.action,
      description: step.description,
      message: `⚠️ **Confirmation requise**\n\nÉtape ${stepIndex + 1}: ${step.description}\n\nDois-je procéder ?`
    };
  }

  // Exécuter l'étape
  try {
    const result = await executeTool(step.action, step.params);

    return {
      success: true,
      step: stepIndex,
      action: step.action,
      result,
      complete: stepIndex >= task.steps.length - 1
    };
  } catch (err) {
    console.error(`[AGENT] Erreur étape ${stepIndex}:`, err);
    return {
      success: false,
      step: stepIndex,
      action: step.action,
      error: err.message
    };
  }
}

/**
 * Exécute une tâche complète (avec confirmations si nécessaire)
 */
export async function executeTask(taskId, executeTool, confirmed = false) {
  const task = await getTask(taskId);
  if (!task) {
    return { success: false, error: 'Tâche non trouvée' };
  }

  // Mettre la tâche en cours
  await updateTaskStatus(taskId, TASK_STATUS.RUNNING);

  const results = [];

  for (let i = task.current_step; i < task.steps.length; i++) {
    const stepResult = await executeStep(task, i, executeTool);

    if (!stepResult.success) {
      // Échec - marquer la tâche comme échouée
      await updateTaskStatus(taskId, TASK_STATUS.FAILED, { steps: results }, stepResult.error);
      return {
        success: false,
        taskId,
        failedStep: i,
        error: stepResult.error,
        completedSteps: results
      };
    }

    if (stepResult.needsConfirmation && !confirmed) {
      // Mettre en pause pour confirmation
      await updateTaskStatus(taskId, TASK_STATUS.NEEDS_CONFIRMATION);
      await advanceTaskStep(taskId, { status: 'awaiting_confirmation' });

      return {
        success: true,
        needsConfirmation: true,
        taskId,
        currentStep: i,
        message: stepResult.message,
        completedSteps: results
      };
    }

    results.push(stepResult);
    await advanceTaskStep(taskId, stepResult.result);
  }

  // Tâche terminée
  await updateTaskStatus(taskId, TASK_STATUS.COMPLETED, { steps: results });

  return {
    success: true,
    taskId,
    complete: true,
    results,
    message: '✅ Tâche terminée avec succès !'
  };
}

/**
 * Confirme et continue une tâche en attente
 */
export async function confirmAndContinue(taskId, executeTool) {
  const task = await getTask(taskId);
  if (!task || task.status !== TASK_STATUS.NEEDS_CONFIRMATION) {
    return { success: false, error: 'Tâche non trouvée ou pas en attente de confirmation' };
  }

  // Continuer l'exécution avec confirmation
  return await executeTask(taskId, executeTool, true);
}

// ============================================================
// === STATISTIQUES ===
// ============================================================

/**
 * Obtient les statistiques des tâches
 */
export async function getTaskStats() {
  try {
    const { data, error } = await supabase
      .from('halimah_tasks')
      .select('status');

    if (error) {
      console.error('[AGENT] Erreur getTaskStats:', error);
      return null;
    }

    const stats = {
      total: data.length,
      byStatus: {}
    };

    data.forEach(task => {
      stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
    });

    return stats;
  } catch (err) {
    console.error('[AGENT] Exception getTaskStats:', err);
    return null;
  }
}

/**
 * Récupère l'historique des tâches récentes
 */
export async function getTaskHistory(limit = 20) {
  try {
    const { data, error } = await supabase
      .from('halimah_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AGENT] Erreur getTaskHistory:', error);
      return [];
    }

    return data.map(task => ({
      id: task.id,
      description: task.description,
      status: task.status,
      stepsCount: task.steps ? JSON.parse(task.steps).length : 0,
      currentStep: task.current_step,
      createdAt: task.created_at,
      completedAt: task.completed_at,
      error: task.error
    }));
  } catch (err) {
    console.error('[AGENT] Exception getTaskHistory:', err);
    return [];
  }
}

export default {
  // États
  TASK_STATUS,

  // Gestion des tâches
  createTask,
  getTask,
  updateTaskStatus,
  advanceTaskStep,
  getPendingTasks,
  cancelTask,

  // Planification
  analyzeAndPlan,
  requiresConfirmation,
  formatPlanForDisplay,

  // Exécution
  executeStep,
  executeTask,
  confirmAndContinue,

  // Stats
  getTaskStats,
  getTaskHistory
};
