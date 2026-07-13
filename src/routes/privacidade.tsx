import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/privacidade")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f6f2e9] px-5 py-6 text-[#111827]">
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-card md:p-10">
        <header>
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <Logo className="h-16 w-auto" />
          <h1 className="mt-6 text-3xl font-black">Política de Privacidade</h1>
          <p className="mt-2 text-sm text-muted-foreground">Última atualização: 13 de julho de 2026</p>
        </header>

        <div className="mt-8 space-y-7 text-sm leading-7 text-[#374151]">
          <Section title="1. Quem somos">
            O SOS Marceneiros é uma plataforma para marcenarias anunciarem, buscarem e negociarem
            sobras de materiais, como chapas de MDF, com outras empresas e profissionais do setor.
          </Section>

          <Section title="2. Dados que coletamos">
            Podemos coletar dados informados por você, como nome, e-mail, telefone, WhatsApp, nome
            da empresa, endereço comercial, localização aproximada da empresa, fotos de materiais,
            anúncios, pedidos de busca, alertas automáticos e mensagens relacionadas ao uso do app.
          </Section>

          <Section title="3. Login com Google">
            Ao entrar com Google, usamos apenas as informações necessárias para autenticar sua conta,
            como nome, endereço de e-mail e identificador da conta Google. Esses dados são usados para
            permitir seu acesso ao app, proteger sua conta e associar seu perfil aos anúncios, pedidos
            e configurações cadastradas por você.
          </Section>

          <Section title="4. Como usamos os dados">
            Usamos seus dados para criar e gerenciar sua conta, exibir anúncios de materiais,
            calcular distância aproximada entre empresas, enviar notificações, gerar alertas de
            compatibilidade, melhorar a experiência do app, combater fraude e cumprir obrigações
            legais.
          </Section>

          <Section title="5. Compartilhamento">
            Dados públicos do perfil comercial, como nome da empresa, cidade, estado, logo e materiais
            anunciados, podem aparecer para outros usuários do app. Não vendemos seus dados pessoais.
            Podemos usar provedores de tecnologia, como hospedagem, banco de dados, autenticação e
            notificações, apenas para operar o serviço.
          </Section>

          <Section title="6. Fotos, localização e notificações">
            O app pode solicitar acesso à câmera, galeria, localização e notificações conforme as
            funções usadas. A localização é usada principalmente para indicar onde a empresa está e
            calcular proximidade entre materiais e compradores. Você pode alterar permissões nas
            configurações do seu dispositivo.
          </Section>

          <Section title="7. Armazenamento e segurança">
            Mantemos os dados pelo tempo necessário para operar a conta e cumprir obrigações legais.
            Aplicamos medidas técnicas e controles de acesso para proteger as informações, mas nenhum
            sistema é completamente imune a falhas.
          </Section>

          <Section title="8. Seus direitos">
            Você pode solicitar acesso, correção ou exclusão dos seus dados, bem como pedir a remoção
            da sua conta, quando aplicável. Algumas informações podem ser mantidas quando necessário
            para segurança, prevenção de fraude ou obrigações legais.
          </Section>

          <Section title="9. Contato">
            Para dúvidas sobre privacidade ou solicitação relacionada aos seus dados, entre em contato
            pelo e-mail{" "}
            <a className="font-bold text-primary underline" href="mailto:sosmarceneiroapp@gmail.com">
              sosmarceneiroapp@gmail.com
            </a>
            .
          </Section>
        </div>

        <footer className="mt-10 border-t border-[#e2daca] pt-5 text-sm">
          <Link to="/termos" className="font-bold text-primary underline">
            Ver Termos de Uso
          </Link>
        </footer>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-black text-[#111827]">{title}</h2>
      <p className="mt-2">{children}</p>
    </section>
  );
}
