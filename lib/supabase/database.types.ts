export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      center_onboarding_invitations: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          cancelled_at: string | null
          created_at: string
          failure_code: string | null
          id: string
          installation_center_id: string
          invited_by_profile_id: string
          invited_email: string
          review_required_at: string | null
          status: string
          superseded_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          failure_code?: string | null
          id?: string
          installation_center_id: string
          invited_by_profile_id: string
          invited_email: string
          review_required_at?: string | null
          status?: string
          superseded_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          failure_code?: string | null
          id?: string
          installation_center_id?: string
          invited_by_profile_id?: string
          invited_email?: string
          review_required_at?: string | null
          status?: string
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "center_onboarding_invitations_installation_center_id_fkey"
            columns: ["installation_center_id"]
            isOneToOne: false
            referencedRelation: "installation_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_onboarding_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      country_agents: {
        Row: {
          code: string
          country_code: string
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          code: string
          country_code: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      dealers: {
        Row: {
          code: string
          country_agent_id: string
          country_code: string
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          code: string
          country_agent_id: string
          country_code: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          code?: string
          country_agent_id?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealers_country_agent_country_fkey"
            columns: ["country_agent_id", "country_code"]
            isOneToOne: false
            referencedRelation: "country_agents"
            referencedColumns: ["id", "country_code"]
          },
        ]
      }
      installation_centers: {
        Row: {
          city: string
          code: string
          country_agent_id: string | null
          country_code: string
          created_at: string
          dealer_id: string | null
          id: string
          name: string
          status: string
        }
        Insert: {
          city: string
          code: string
          country_agent_id?: string | null
          country_code: string
          created_at?: string
          dealer_id?: string | null
          id?: string
          name: string
          status?: string
        }
        Update: {
          city?: string
          code?: string
          country_agent_id?: string | null
          country_code?: string
          created_at?: string
          dealer_id?: string | null
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "installation_centers_agent_country_fkey"
            columns: ["country_agent_id", "country_code"]
            isOneToOne: false
            referencedRelation: "country_agents"
            referencedColumns: ["id", "country_code"]
          },
          {
            foreignKeyName: "installation_centers_dealer_country_fkey"
            columns: ["dealer_id", "country_code"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id", "country_code"]
          },
        ]
      }
      operational_parties: {
        Row: {
          country_agent_id: string | null
          created_at: string
          dealer_id: string | null
          id: string
          installation_center_id: string | null
          party_type: string
          transfer_code: string
        }
        Insert: {
          country_agent_id?: string | null
          created_at?: string
          dealer_id?: string | null
          id?: string
          installation_center_id?: string | null
          party_type: string
          transfer_code: string
        }
        Update: {
          country_agent_id?: string | null
          created_at?: string
          dealer_id?: string | null
          id?: string
          installation_center_id?: string | null
          party_type?: string
          transfer_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_parties_country_agent_id_fkey"
            columns: ["country_agent_id"]
            isOneToOne: true
            referencedRelation: "country_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_parties_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: true
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_parties_installation_center_id_fkey"
            columns: ["installation_center_id"]
            isOneToOne: true
            referencedRelation: "installation_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string | null
          mime_type: string
          original_name: string
          product_id: string
          size_bytes: number
          sort_order: number
          storage_path: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          mime_type: string
          original_name: string
          product_id: string
          size_bytes: number
          sor²È="24‰t(€€€€€€€€€ô°(€€€€€€€t(€€€€€ô(€€€€€É½±±Ìèì(€€€€€€€I½Üèì(€€€€€€€€€É•…Ñ•‘}…ĞèÍÑÉ¥¹œ(€€€€€€€€€•ÉÁ}Í•É¥…°èÍÑÉ¥¹œ(€€€€€€€€€¥èÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ}¥èÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ¥½¹}±½Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ¥½¹}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€€€É½±±}¥¹‘•àè¹Õµ‰•È(€€€€€€€€€Í•É¥…±}¹Õµ‰•ÈèÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€%¹Í•ÉĞèì(€€€€€€€€€É•…Ñ•‘}…ĞüèÍÑÉ¥¹œ(€€€€€€€€€•ÉÁ}Í•É¥…°èÍÑÉ¥¹œ(€€€€€€€€€¥üèÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ}¥èÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ¥½¹}±½Ñ}¥èÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ¥½¹}½É‘•É}¥èÍÑÉ¥¹œ(€€€€€€€€€É½±±}¥¹‘•àè¹Õµ‰•È(€€€€€€€€€Í•É¥…±}¹Õµ‰•ÈèÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€UÁ‘…Ñ”èì(€€€€€€€€€É•…Ñ•‘}…ĞüèÍÑÉ¥¹œ(€€€€€€€€€•ÉÁ}Í•É¥…°üèÍÑÉ¥¹œ(€€€€€€€€€¥üèÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ}¥üèÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ¥½¹}±½Ñ}¥üèÍÑÉ¥¹œ(€€€€€€€€€ÁÉ½‘ÕÑ¥½¹}½É‘•É}¥üèÍÑÉ¥¹œ(€€€€€€€€€É½±±}¥¹‘•àüè¹Õµ‰•È(€€€€€€€€€Í•É¥…±}¹Õµ‰•ÈüèÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•±…Ñ¥½¹Í¡¥ÁÌèl(€€€€€€€€€ì(€€€€€€€€€€€™½É•¥¹-•å9…µ”è€‰É½±±Í}±½Ñ}½É‘•É}ÁÉ½‘ÕÑ}½¹Í¥ÍÑ•¹å}™­•äˆ(€€€€€€€€€€€½±Õµ¹Ìèl‰ÁÉ½‘ÕÑ¥½¹}±½Ñ}¥ˆ°€‰ÁÉ½‘ÕÑ¥½¹}½É‘•É}¥ˆ°€‰ÁÉ½‘ÕÑ}¥‰t(€€€€€€€€€€€¥Í=¹•Q½=¹”è™…±Í”(€€€€€€€€€€€É•™•É•¹•‘I•±…Ñ¥½¸è€‰ÁÉ½‘ÕÑ¥½¹}±½ÑÌˆ(€€€€€€€€€€€É•™•É•¹•‘½±Õµ¹Ìèl‰¥ˆ°€‰ÁÉ½‘ÕÑ¥½¹}½É‘•É}¥ˆ°€‰ÁÉ½‘ÕÑ}¥‰t(€€€€€€€€€ô°(€€€€€€€€€ì(€€€€€€€€€€€™½É•¥¹-•å9…µ”è€‰É½±±Í}ÁÉ½‘ÕÑ}¥‘}™­•äˆ(€€€€€€€€€€€½±Õµ¹Ìèl‰ÁÉ½‘ÕÑ}¥‰t(€€€€€€€€€€€¥Í=¹•Q½=¹”è™…±Í”(€€€€€€€€€€€É•™•É•¹•‘I•±…Ñ¥½¸è€‰ÁÉ½‘ÕÑÌˆ(€€€€€€€€€€€É•™•É•¹•‘½±Õµ¹Ìèl‰¥‰t(€€€€€€€€€ô°(€€€€€€€€€ì(€€€€€€€€€€€™½É•¥¹-•å9…µ”è€‰É½±±Í}ÁÉ½‘ÕÑ¥½¹}±½Ñ}¥‘}™­•äˆ(€€€€€€€€€€€½±Õµ¹Ìèl‰ÁÉ½‘ÕÑ¥½¹}±½Ñ}¥‰t(€€€€€€€€€€€¥Í=¹•Q½=¹”è™…±Í”(€€€€€€€€€€€É•™•É•¹•‘I•±…Ñ¥½¸è€‰ÁÉ½‘ÕÑ¥½¹}±½ÑÌˆ(€€€€€€€€€€€É•™•É•¹•‘½±Õµ¹Ìèl‰¥‰t(€€€€€€€€€ô°(€€€€€€€€€ì(€€€€€€€€€€€™½É•¥¹-•å9…µ”è€‰É½±±Í}ÁÉ½‘ÕÑ¥½¹}½É‘•É}¥‘}™­•äˆ(€€€€€€€€€€€½±Õµ¹Ìèl‰ÁÉ½‘ÕÑ¥½¹}½É‘•É}¥‰t(€€€€€€€€€€€¥Í=¹•Q½=¹”è™…±Í”(€€€€€€€€€€€É•™•É•¹•‘I•±…Ñ¥½¸è€‰ÁÉ½‘ÕÑ¥½¹}½É‘•ÉÌˆ(€€€€€€€€€€€É•™•É•¹•‘½±Õµ¹Ìèl‰¥‰t(€€€€€€€€€ô°(€€€€€€€t(€€€€€ô(€€€ô(€€€Y¥•İÌèì(€€€€€m|¥¸¹•Ù•Étè¹•Ù•È(€€€ô(€€€Õ¹Ñ¥½¹Ìèì(€€€€€É•…Ñ•}ÁÉ½‘ÕÑ¥½¹}½É‘•Èèì(€€€€€€€ÉÌèì(€€€€€€€€€Á}±½ÑÌè)Í½¸(€€€€€€€€€Á}¹½Ñ•ÌüèÍÑÉ¥¹œ(€€€€€€€€€Á}ÁÉ½‘ÕÑ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}ÁÉ½‘ÕÑ¥½¹}‘…Ñ”èÍÑÉ¥¹œ(€€€€€€€€€Á}É•ÅÕ•ÍÑ}¥èÍÑÉ¥¹œ(€€€€€€€€€Á}Í½ÕÉ•}É•™•É•¹”üèÍÑÉ¥¹œ(€€€€€€€ô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€•¹ÍÕÉ•}½Á•É…Ñ¥½¹…±}Á…ÉÑäèì(€€€€€€€ÉÌèìÁ}•¹Ñ¥Ñå}¥üèÍÑÉ¥¹œìÁ}Á…ÉÑå}ÑåÁ”èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€•¹•É…Ñ•}½Á•É…Ñ¥½¹…±}ÑÉ…¹Í™•É}½‘”èì(€€€€€€€ÉÌèìÁ}Á…ÉÑå}ÑåÁ”èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€€€É•Í½±Ù•}ÑÉ…¹Í™•É}É•¥Á¥•¹Ğèì(€€€€€€€ÉÌèìÁ}ÑÉ…¹Í™•É}½‘”èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹Ìèì(€€€€€€€€€¥ÑäèÍÑÉ¥¹œ(€€€€€€€€€½Õ¹ÑÉå}½‘”èÍÑÉ¥¹œ(€€€€€€€€€‘¥ÍÁ±…å}¹…µ”èÍÑÉ¥¹œ(€€€€€€€€€•¹Ñ¥Ñå}½‘”èÍÑÉ¥¹œ(€€€€€€€€€•¹Ñ¥Ñå}ÑåÁ”èÍÑÉ¥¹œ(€€€€€€€€€Á…ÉÑå}¥èÍÑÉ¥¹œ(€€€€€€€õmt(€€€€€ô(€€€€€Ù½¥‘}ÁÉ½‘ÕÑ¥½¹}½É‘•Èèì(€€€€€€€ÉÌèìÁ}½É‘•É}¥èÍÑÉ¥¹œìÁ}É•…Í½¸èÍÑÉ¥¹œô(€€€€€€€I•ÑÕÉ¹ÌèÍÑÉ¥¹œ(€€€€€ô(€€€ô(€€€¹ÕµÌèì(€€€€€m|¥¸¹•Ù•Étè¹•Ù•È(€€€ô(€€€½µÁ½Í¥Ñ•QåÁ•Ìèì(€€€€€m|¥¸¹•Ù•Étè¹•Ù•È(€€€ô(€ô)ô()ÑåÁ”…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì€ô=µ¥Ğñ…Ñ…‰…Í”°€‰}}%¹Ñ•É¹…±MÕÁ…‰…Í”ˆø()ÑåÁ”•™…Õ±ÑM¡•µ„€ô…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±ÍmáÑÉ…Ğñ­•å½˜…Ñ…‰…Í”°€‰ÁÕ‰±¥Œˆùt()•áÁ½ÉĞÑåÁ”Q…‰±•Ìğ(€•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì(€€€ğ­•å½˜€¡•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰t€˜•™…Õ±ÑM¡•µ…l‰Y¥•İÌ‰t¤(€€€ğìÍ¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ìô°(€Q…‰±•9…µ”•áÑ•¹‘Ì•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€€€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì(€ô(€€€€ü­•å½˜€¡…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Q…‰±•Ì‰t€˜(€€€€€€€…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Y¥•İÌ‰t¤(€€€€è¹•Ù•È€ô¹•Ù•È°(ø€ô•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì)ô(€€ü€¡…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Q…‰±•Ì‰t€˜(€€€€€…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Y¥•İÌ‰t¥mQ…‰±•9…µ•t•áÑ•¹‘Ìì(€€€€€I½Üè¥¹™•ÈH(€€€ô(€€€€üH(€€€€è¹•Ù•È(€€è•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì­•å½˜€¡•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰t€˜(€€€€€€€•™…Õ±ÑM¡•µ…l‰Y¥•İÌ‰t¤(€€€€ü€¡•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰t€˜(€€€€€€€•™…Õ±ÑM¡•µ…l‰Y¥•İÌ‰t¥m•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ít•áÑ•¹‘Ìì(€€€€€€€I½Üè¥¹™•ÈH(€€€€€ô(€€€€€€üH(€€€€€€è¹•Ù•È(€€€€è¹•Ù•È()•áÁ½ÉĞÑåÁ”Q…‰±•Í%¹Í•ÉĞğ(€•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì(€€€ğ­•å½˜•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰t(€€€ğìÍ¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ìô°(€Q…‰±•9…µ”•áÑ•¹‘Ì•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€€€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì(€ô(€€€€ü­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Q…‰±•Ì‰t(€€€€è¹•Ù•È€ô¹•Ù•È°(ø€ô•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì)ô(€€ü…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Q…‰±•Ì‰umQ…‰±•9…µ•t•áÑ•¹‘Ìì(€€€€€%¹Í•ÉĞè¥¹™•È$(€€€ô(€€€€ü$(€€€€è¹•Ù•È(€€è•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì­•å½˜•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰t(€€€€ü•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰um•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ít•áÑ•¹‘Ìì(€€€€€€€%¹Í•ÉĞè¥¹™•È$(€€€€€ô(€€€€€€ü$(€€€€€€è¹•Ù•È(€€€€è¹•Ù•È()•áÁ½ÉĞÑåÁ”Q…‰±•ÍUÁ‘…Ñ”ğ(€•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì(€€€ğ­•å½˜•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰t(€€€ğìÍ¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ìô°(€Q…‰±•9…µ”•áÑ•¹‘Ì•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€€€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì(€ô(€€€€ü­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Q…‰±•Ì‰t(€€€€è¹•Ù•È€ô¹•Ù•È°(ø€ô•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì)ô(€€ü…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰Q…‰±•Ì‰umQ…‰±•9…µ•t•áÑ•¹‘Ìì(€€€€€UÁ‘…Ñ”è¥¹™•ÈT(€€€ô(€€€€üT(€€€€è¹•Ù•È(€€è•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì­•å½˜•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰t(€€€€ü•™…Õ±ÑM¡•µ…l‰Q…‰±•Ì‰um•™…Õ±ÑM¡•µ…Q…‰±•9…µ•=É=ÁÑ¥½¹Ít•áÑ•¹‘Ìì(€€€€€€€UÁ‘…Ñ”è¥¹™•ÈT(€€€€€ô(€€€€€€üT(€€€€€€è¹•Ù•È(€€€€è¹•Ù•È()•áÁ½ÉĞÑåÁ”¹ÕµÌğ(€•™…Õ±ÑM¡•µ…¹Õµ9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì(€€€ğ­•å½˜•™…Õ±ÑM¡•µ…l‰¹ÕµÌ‰t(€€€ğìÍ¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ìô°(€¹Õµ9…µ”•áÑ•¹‘Ì•™…Õ±ÑM¡•µ…¹Õµ9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€€€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì(€ô(€€€€ü­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…¹Õµ9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰¹ÕµÌ‰t(€€€€è¹•Ù•È€ô¹•Ù•È°(ø€ô•™…Õ±ÑM¡•µ…¹Õµ9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì)ô(€€ü…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ím•™…Õ±ÑM¡•µ…¹Õµ9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰¹ÕµÌ‰um¹Õµ9…µ•t(€€è•™…Õ±ÑM¡•µ…¹Õµ9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì­•å½˜•™…Õ±ÑM¡•µ…l‰¹ÕµÌ‰t(€€€€ü•™…Õ±ÑM¡•µ…l‰¹ÕµÌ‰um•™…Õ±ÑM¡•µ…¹Õµ9…µ•=É=ÁÑ¥½¹Ít(€€€€è¹•Ù•È()•áÁ½ÉĞÑåÁ”½µÁ½Í¥Ñ•QåÁ•Ìğ(€AÕ‰±¥½µÁ½Í¥Ñ•QåÁ•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì(€€€ğ­•å½˜•™…Õ±ÑM¡•µ…l‰½µÁ½Í¥Ñ•QåÁ•Ì‰t(€€€ğìÍ¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ìô°(€½µÁ½Í¥Ñ•QåÁ•9…µ”•áÑ•¹‘ÌAÕ‰±¥½µÁ½Í¥Ñ•QåÁ•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€€€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì(€ô(€€€€ü­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±ÍmAÕ‰±¥½µÁ½Í¥Ñ•QåÁ•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰½µÁ½Í¥Ñ•QåÁ•Ì‰t(€€€€è¹•Ù•È€ô¹•Ù•È°(ø€ôAÕ‰±¥½µÁ½Í¥Ñ•QåÁ•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ìì(€Í¡•µ„è­•å½˜…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±Ì)ô(€€ü…Ñ…‰…Í•]¥Ñ¡½ÕÑ%¹Ñ•É¹…±ÍmAÕ‰±¥½µÁ½Í¥Ñ•QåÁ•9…µ•=É=ÁÑ¥½¹Íl‰Í¡•µ„‰uul‰½µÁ½Í¥Ñ•QåÁ•Ì‰um½µÁ½Í¥Ñ•QåÁ•9…µ•t(€€èAÕ‰±¥½µÁ½Í¥Ñ•QåÁ•9…µ•=É=ÁÑ¥½¹Ì•áÑ•¹‘Ì­•å½˜•™…Õ±ÑM¡•µ…l‰½µÁ½Í¥Ñ•QåÁ•Ì‰t(€€€€ü•™…Õ±ÑM¡•µ…l‰½µÁ½Í¥Ñ•QåÁ•Ì‰umAÕ‰±¥½µÁ½Í¥Ñ•QåÁ•9…µ•=É=ÁÑ¥½¹Ít(€€€€è¹•Ù•È()•áÁ½ÉĞ½¹ÍĞ½¹ÍÑ…¹ÑÌ€ôì(€ÁÕ‰±¥Œèì(€€€¹ÕµÌèíô°(€ô°)ô…Ì½¹ÍĞ(