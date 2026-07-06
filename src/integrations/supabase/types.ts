export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          auto_approve: boolean
          auto_reject: boolean
          enabled: boolean
          id: boolean
          manual_review_threshold: number
          minimum_confidence: number
          provider: string | null
          updated_at: string
        }
        Insert: {
          auto_approve?: boolean
          auto_reject?: boolean
          enabled?: boolean
          id?: boolean
          manual_review_threshold?: number
          minimum_confidence?: number
          provider?: string | null
          updated_at?: string
        }
        Update: {
          auto_approve?: boolean
          auto_reject?: boolean
          enabled?: boolean
          id?: boolean
          manual_review_threshold?: number
          minimum_confidence?: number
          provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      alertas: {
        Row: {
          ativo: boolean
          comprimento_min_cm: number | null
          created_at: string
          espessura_mm: number | null
          fabricante: string | null
          id: string
          largura_min_cm: number | null
          nome: string | null
          padrao: string | null
          preco_max: number | null
          raio_km: number | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          comprimento_min_cm?: number | null
          created_at?: string
          espessura_mm?: number | null
          fabricante?: string | null
          id?: string
          largura_min_cm?: number | null
          nome?: string | null
          padrao?: string | null
          preco_max?: number | null
          raio_km?: number | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          comprimento_min_cm?: number | null
          created_at?: string
          espessura_mm?: number | null
          fabricante?: string | null
          id?: string
          largura_min_cm?: number | null
          nome?: string | null
          padrao?: string | null
          preco_max?: number | null
          raio_km?: number | null
          user_id?: string
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          init_point: string | null
          mp_preapproval_id: string | null
          plano_id: string
          proximo_pagamento: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          init_point?: string | null
          mp_preapproval_id?: string | null
          plano_id: string
          proximo_pagamento?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          init_point?: string | null
          mp_preapproval_id?: string | null
          plano_id?: string
          proximo_pagamento?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          ativo: boolean
          botao_texto: string | null
          clicks: number
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          delay_segundos: number
          duracao_segundos: number
          exibir_abertura: boolean
          id: string
          imagem_url: string
          intervalo_minutos: number
          link: string | null
          ordem: number
          planos_alvo: string[]
          subtitulo: string | null
          titulo: string | null
          updated_at: string
          views: number
        }
        Insert: {
          ativo?: boolean
          botao_texto?: string | null
          clicks?: number
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          delay_segundos?: number
          duracao_segundos?: number
          exibir_abertura?: boolean
          id?: string
          imagem_url: string
          intervalo_minutos?: number
          link?: string | null
          ordem?: number
          planos_alvo?: string[]
          subtitulo?: string | null
          titulo?: string | null
          updated_at?: string
          views?: number
        }
        Update: {
          ativo?: boolean
          botao_texto?: string | null
          clicks?: number
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          delay_segundos?: number
          duracao_segundos?: number
          exibir_abertura?: boolean
          id?: string
          imagem_url?: string
          intervalo_minutos?: number
          link?: string | null
          ordem?: number
          planos_alvo?: string[]
          subtitulo?: string | null
          titulo?: string | null
          updated_at?: string
          views?: number
        }
        Relationships: []
      }
      denuncias: {
        Row: {
          admin_id: string | null
          admin_nota: string | null
          categoria: string
          created_at: string
          denunciante_id: string
          empresa_id: string | null
          id: string
          material_id: string | null
          observacao: string | null
          resolvida_em: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          admin_nota?: string | null
          categoria: string
          created_at?: string
          denunciante_id: string
          empresa_id?: string | null
          id?: string
          material_id?: string | null
          observacao?: string | null
          resolvida_em?: string | null
          status?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          admin_nota?: string | null
          categoria?: string
          created_at?: string
          denunciante_id?: string
          empresa_id?: string | null
          id?: string
          material_id?: string | null
          observacao?: string | null
          resolvida_em?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "denuncias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denuncias_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_historico: {
        Row: {
          autor_id: string | null
          created_at: string
          descricao: string
          empresa_id: string
          id: string
          tipo: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          descricao: string
          empresa_id: string
          id?: string
          tipo: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          descricao?: string
          empresa_id?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_historico_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          advertencias: number
          avaliacao: number | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          nome_empresa: string | null
          numero: string | null
          observacoes_admin: string | null
          onboarded: boolean
          owner_id: string
          plano: string | null
          plano_id: string | null
          plano_inicio: string | null
          plano_vencimento: string | null
          pontos_penalidade: number
          premium_trial_fim: string | null
          ref_codigo_usado: string | null
          responsavel: string | null
          status: Database["public"]["Enums"]["empresa_status"]
          suspensa_ate: string | null
          telefone: string | null
          total_negociacoes: number
          ultimo_acesso: string | null
          updated_at: string
          vendedor_id: string | null
          whatsapp: string | null
        }
        Insert: {
          advertencias?: number
          avaliacao?: number | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          nome_empresa?: string | null
          numero?: string | null
          observacoes_admin?: string | null
          onboarded?: boolean
          owner_id: string
          plano?: string | null
          plano_id?: string | null
          plano_inicio?: string | null
          plano_vencimento?: string | null
          pontos_penalidade?: number
          premium_trial_fim?: string | null
          ref_codigo_usado?: string | null
          responsavel?: string | null
          status?: Database["public"]["Enums"]["empresa_status"]
          suspensa_ate?: string | null
          telefone?: string | null
          total_negociacoes?: number
          ultimo_acesso?: string | null
          updated_at?: string
          vendedor_id?: string | null
          whatsapp?: string | null
        }
        Update: {
          advertencias?: number
          avaliacao?: number | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          nome_empresa?: string | null
          numero?: string | null
          observacoes_admin?: string | null
          onboarded?: boolean
          owner_id?: string
          plano?: string | null
          plano_id?: string | null
          plano_inicio?: string | null
          plano_vencimento?: string | null
          pontos_penalidade?: number
          premium_trial_fim?: string | null
          ref_codigo_usado?: string | null
          responsavel?: string | null
          status?: Database["public"]["Enums"]["empresa_status"]
          suspensa_ate?: string | null
          telefone?: string | null
          total_negociacoes?: number
          ultimo_acesso?: string | null
          updated_at?: string
          vendedor_id?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      espessuras: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          ordem: number
          valor_mm: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          valor_mm: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          valor_mm?: number
        }
        Relationships: []
      }
      fabricantes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      favoritos: {
        Row: {
          created_at: string
          id: string
          material_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favoritos_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro: {
        Row: {
          created_at: string
          empresa_id: string
          forma_pagamento: string | null
          id: string
          observacoes: string | null
          pagamento: string | null
          plano_id: string | null
          status: Database["public"]["Enums"]["financeiro_status"]
          valor: number
          vencimento: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          forma_pagamento?: string | null
          id?: string
          observacoes?: string | null
          pagamento?: string | null
          plano_id?: string | null
          status?: Database["public"]["Enums"]["financeiro_status"]
          valor: number
          vencimento: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          forma_pagamento?: string | null
          id?: string
          observacoes?: string | null
          pagamento?: string | null
          plano_id?: string | null
          status?: Database["public"]["Enums"]["financeiro_status"]
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      fotos_materiais: {
        Row: {
          ai_category: Database["public"]["Enums"]["ai_category"] | null
          ai_provider: string | null
          ai_reason: string | null
          ai_score: number | null
          ai_status: Database["public"]["Enums"]["ai_status"]
          created_at: string
          empresa_id: string | null
          id: string
          material_id: string
          needs_ai_analysis: boolean
          ordem: number
          reviewed_at: string | null
          reviewed_by: string | null
          url: string
        }
        Insert: {
          ai_category?: Database["public"]["Enums"]["ai_category"] | null
          ai_provider?: string | null
          ai_reason?: string | null
          ai_score?: number | null
          ai_status?: Database["public"]["Enums"]["ai_status"]
          created_at?: string
          empresa_id?: string | null
          id?: string
          material_id: string
          needs_ai_analysis?: boolean
          ordem?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          url: string
        }
        Update: {
          ai_category?: Database["public"]["Enums"]["ai_category"] | null
          ai_provider?: string | null
          ai_reason?: string | null
          ai_score?: number | null
          ai_status?: Database["public"]["Enums"]["ai_status"]
          created_at?: string
          empresa_id?: string | null
          id?: string
          material_id?: string
          needs_ai_analysis?: boolean
          ordem?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotos_materiais_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais"
            referencedColumns: ["id"]
          },
        ]
      }
      indicacoes: {
        Row: {
          aprovada_em: string | null
          codigo: string
          comissao_valor: number
          created_at: string
          empresa_id: string
          id: string
          observacoes: string | null
          paga: boolean
          paga_em: string | null
          premium_fim: string | null
          premium_inicio: string | null
          status: Database["public"]["Enums"]["indicacao_status"]
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          aprovada_em?: string | null
          codigo: string
          comissao_valor?: number
          created_at?: string
          empresa_id: string
          id?: string
          observacoes?: string | null
          paga?: boolean
          paga_em?: string | null
          premium_fim?: string | null
          premium_inicio?: string | null
          status?: Database["public"]["Enums"]["indicacao_status"]
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          aprovada_em?: string | null
          codigo?: string
          comissao_valor?: number
          created_at?: string
          empresa_id?: string
          id?: string
          observacoes?: string | null
          paga?: boolean
          paga_em?: string | null
          premium_fim?: string | null
          premium_inicio?: string | null
          status?: Database["public"]["Enums"]["indicacao_status"]
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores_parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      materiais: {
        Row: {
          area_m2: number | null
          cidade: string | null
          comprimento_cm: number
          contatos: number
          created_at: string
          empresa_id: string
          espessura_mm: number
          estado: string | null
          fabricante: string | null
          fabricante_id: string | null
          grain_direction: string | null
          id: string
          largura_cm: number
          latitude: number | null
          longitude: number | null
          observacoes: string | null
          padrao: string
          padrao_id: string | null
          preco: number
          quantidade: number
          status: Database["public"]["Enums"]["material_status"]
          updated_at: string
          valor_m2: number | null
          valor_vendido: number | null
          views: number
        }
        Insert: {
          area_m2?: number | null
          cidade?: string | null
          comprimento_cm: number
          contatos?: number
          created_at?: string
          empresa_id: string
          espessura_mm: number
          estado?: string | null
          fabricante?: string | null
          fabricante_id?: string | null
          grain_direction?: string | null
          id?: string
          largura_cm: number
          latitude?: number | null
          longitude?: number | null
          observacoes?: string | null
          padrao: string
          padrao_id?: string | null
          preco: number
          quantidade?: number
          status?: Database["public"]["Enums"]["material_status"]
          updated_at?: string
          valor_m2?: number | null
          valor_vendido?: number | null
          views?: number
        }
        Update: {
          area_m2?: number | null
          cidade?: string | null
          comprimento_cm?: number
          contatos?: number
          created_at?: string
          empresa_id?: string
          espessura_mm?: number
          estado?: string | null
          fabricante?: string | null
          fabricante_id?: string | null
          grain_direction?: string | null
          id?: string
          largura_cm?: number
          latitude?: number | null
          longitude?: number | null
          observacoes?: string | null
          padrao?: string
          padrao_id?: string | null
          preco?: number
          quantidade?: number
          status?: Database["public"]["Enums"]["material_status"]
          updated_at?: string
          valor_m2?: number | null
          valor_vendido?: number | null
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "materiais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiais_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materiais_padrao_id_fkey"
            columns: ["padrao_id"]
            isOneToOne: false
            referencedRelation: "padroes"
            referencedColumns: ["id"]
          },
        ]
      }
      material_contatos: {
        Row: {
          created_at: string
          id: number
          material_id: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          material_id: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          material_id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_contatos_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais"
            referencedColumns: ["id"]
          },
        ]
      }
      material_views: {
        Row: {
          created_at: string
          id: number
          material_id: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          material_id: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          material_id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_views_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          alerta_id: string | null
          created_at: string
          id: string
          lida: boolean
          material_id: string | null
          mensagem: string
          pedido_id: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          alerta_id?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          material_id?: string | null
          mensagem: string
          pedido_id?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          alerta_id?: string | null
          created_at?: string
          id?: string
          lida?: boolean
          material_id?: string | null
          mensagem?: string
          pedido_id?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_material"
            referencedColumns: ["id"]
          },
        ]
      }
      padroes: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          fabricante_id: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          fabricante_id: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          fabricante_id?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "padroes_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_material: {
        Row: {
          cidade: string | null
          comprimento_min_cm: number
          created_at: string
          espessura_mm: number
          estado: string | null
          fabricante: string | null
          fabricante_id: string | null
          id: string
          largura_min_cm: number
          latitude: number | null
          longitude: number | null
          observacoes: string | null
          padrao: string
          padrao_id: string | null
          quantidade: number
          raio_km: number
          status: Database["public"]["Enums"]["pedido_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade?: string | null
          comprimento_min_cm?: number
          created_at?: string
          espessura_mm: number
          estado?: string | null
          fabricante?: string | null
          fabricante_id?: string | null
          id?: string
          largura_min_cm?: number
          latitude?: number | null
          longitude?: number | null
          observacoes?: string | null
          padrao: string
          padrao_id?: string | null
          quantidade?: number
          raio_km?: number
          status?: Database["public"]["Enums"]["pedido_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade?: string | null
          comprimento_min_cm?: number
          created_at?: string
          espessura_mm?: number
          estado?: string | null
          fabricante?: string | null
          fabricante_id?: string | null
          id?: string
          largura_min_cm?: number
          latitude?: number | null
          longitude?: number | null
          observacoes?: string | null
          padrao?: string
          padrao_id?: string | null
          quantidade?: number
          raio_km?: number
          status?: Database["public"]["Enums"]["pedido_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_material_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_material_padrao_id_fkey"
            columns: ["padrao_id"]
            isOneToOne: false
            referencedRelation: "padroes"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          descricao: string | null
          duracao_dias: number
          id: string
          max_alertas: number
          max_anuncios: number
          max_buscas: number
          max_fotos: number
          nome: string
          ordem: number
          preco: number
          recursos: Json
          slug: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          duracao_dias: number
          id?: string
          max_alertas?: number
          max_anuncios?: number
          max_buscas?: number
          max_fotos?: number
          nome: string
          ordem?: number
          preco: number
          recursos?: Json
          slug?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          duracao_dias?: number
          id?: string
          max_alertas?: number
          max_anuncios?: number
          max_buscas?: number
          max_fotos?: number
          nome?: string
          ordem?: number
          preco?: number
          recursos?: Json
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendedor_cliques: {
        Row: {
          codigo: string
          created_at: string
          id: string
          referer: string | null
          user_agent: string | null
          vendedor_id: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          referer?: string | null
          user_agent?: string | null
          vendedor_id?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          referer?: string | null
          user_agent?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedor_cliques_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores_parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedores_parceiros: {
        Row: {
          ativo: boolean
          codigo: string
          comissao_valor: number
          created_at: string
          email: string
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          comissao_valor?: number
          created_at?: string
          email: string
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          comissao_valor?: number
          created_at?: string
          email?: string
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_acao_anuncio: {
        Args: { _acao: string; _material_id: string }
        Returns: Json
      }
      admin_acao_empresa: {
        Args: { _acao: string; _empresa_id: string }
        Returns: Json
      }
      admin_julgar_denuncia: {
        Args: { _decisao: string; _denuncia_id: string; _nota?: string }
        Returns: Json
      }
      admin_moderar_foto: {
        Args: {
          _decisao: Database["public"]["Enums"]["ai_status"]
          _foto_id: string
          _motivo?: string
        }
        Returns: Json
      }
      aplicar_ref_codigo: { Args: { _codigo: string }; Returns: Json }
      check_plan_limit: {
        Args: { _resource: string; _user_id: string }
        Returns: Json
      }
      empresa_publica: {
        Args: { _empresa_id: string }
        Returns: {
          avaliacao: number
          cidade: string
          created_at: string
          estado: string
          id: string
          latitude: number
          logo_url: string
          longitude: number
          nome_empresa: string
          plano_nome: string
          plano_slug: string
          plano_vigente: boolean
          responsavel: string
          status: Database["public"]["Enums"]["empresa_status"]
          telefone: string
          whatsapp: string
        }[]
      }
      expirar_ciclo_30d: { Args: never; Returns: Json }
      expirar_premiums_trial: { Args: never; Returns: number }
      get_user_plan_status: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      increment_banner_click: {
        Args: { _banner_id: string }
        Returns: undefined
      }
      increment_banner_view: {
        Args: { _banner_id: string }
        Returns: undefined
      }
      materiais_perto_de_voce:
        | {
            Args: {
              _lat?: number
              _limit?: number
              _lon?: number
              _raio_km?: number
              _seed?: string
            }
            Returns: {
              cidade: string
              distancia_km: number
              estado: string
              fabricante: string
              id: string
              latitude: number
              longitude: number
              padrao: string
              plano_slug: string
              plano_vigente: boolean
              preco: number
            }[]
          }
        | {
            Args: { _lat?: number; _limit?: number; _lon?: number }
            Returns: {
              cidade: string
              distancia_km: number
              estado: string
              fabricante: string
              id: string
              latitude: number
              longitude: number
              padrao: string
              plano_slug: string
              preco: number
            }[]
          }
      materiais_planos: {
        Args: { _ids: string[] }
        Returns: {
          material_id: string
          plano_slug: string
          plano_vigente: boolean
        }[]
      }
      registrar_clique_vendedor: {
        Args: { _codigo: string; _referer?: string; _user_agent?: string }
        Returns: string
      }
      register_push_token: {
        Args: { p_platform?: string; p_token: string }
        Returns: undefined
      }
      vendedor_metrics: { Args: { _vendedor_id: string }; Returns: Json }
      verificar_aprovacao_indicacao: {
        Args: { _empresa_id: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_category:
        | "wood_panel"
        | "mdf"
        | "mdp"
        | "plywood"
        | "wood_scrap"
        | "workshop"
        | "hardware"
        | "adult_content"
        | "violence"
        | "spam"
        | "unknown"
      ai_status: "pending" | "approved" | "manual_review" | "rejected"
      app_role: "admin" | "moderator" | "user" | "vendedor"
      empresa_status:
        | "pendente"
        | "ativa"
        | "suspensa"
        | "bloqueada"
        | "vencida"
      financeiro_status: "pago" | "pendente" | "atrasado" | "cancelado"
      indicacao_status: "cadastrada" | "aprovada" | "cancelada" | "expirada"
      material_status:
        | "ativo"
        | "vendido"
        | "pausado"
        | "em_revisao"
        | "suspenso"
        | "expirado"
        | "arquivado"
      pedido_status: "ativo" | "atendido" | "cancelado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_category: [
        "wood_panel",
        "mdf",
        "mdp",
        "plywood",
        "wood_scrap",
        "workshop",
        "hardware",
        "adult_content",
        "violence",
        "spam",
        "unknown",
      ],
      ai_status: ["pending", "approved", "manual_review", "rejected"],
      app_role: ["admin", "moderator", "user", "vendedor"],
      empresa_status: ["pendente", "ativa", "suspensa", "bloqueada", "vencida"],
      financeiro_status: ["pago", "pendente", "atrasado", "cancelado"],
      indicacao_status: ["cadastrada", "aprovada", "cancelada", "expirada"],
      material_status: [
        "ativo",
        "vendido",
        "pausado",
        "em_revisao",
        "suspenso",
        "expirado",
        "arquivado",
      ],
      pedido_status: ["ativo", "atendido", "cancelado"],
    },
  },
} as const
