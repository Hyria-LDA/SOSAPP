import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/termos")({
  component: TermsPage,
});

function TermsPage() {
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
          <h1 className="mt-6 text-3xl font-black">Termos de Uso</h1>
          <p className="mt-2 text-sm text-muted-foreground">Última atualização: 13 de julho de 2026</p>
        </header>

        <div className="mt-8 space-y-7 text-sm leading-7 text-[#374151]">
          <Section title="1. Aceitação dos termos">
            Ao acessar ou usar o SOS Marceneiros, você concorda com estes Termos de Uso e com a
            nossa Política de Privacidade. Se você não concordar com alguma regra, não utilize a
            plataforma.
          </Section>

          <Section title="2. Sobre o SOS Marceneiros">
            O SOS Marceneiros é uma plataforma que conecta marcenarias, empresas e profissionais
            interessados em anunciar, buscar e negociar sobras de materiais, como chapas de MDF e
            itens relacionados ao setor moveleiro.
          </Section>

          <Section title="3. Cadastro e conta">
            Para usar algumas funções, você precisa criar uma conta e informar dados verdadeiros,
            completos e atualizados. Você é responsável por manter a segurança da sua conta e por
            todas as atividades realizadas nela.
          </Section>

          <Section title="4. Anúncios, pedidos e negociações">
            Os usuários são responsáveis pelas informações, fotos, medidas, valores, disponibilidade
            e condições dos materiais anunciados ou procurados. O SOS Marceneiros não é parte da
            negociação entre usuários e não garante pagamento, entrega, retirada, qualidade,
            quantidade ou estado dos materiais.
          </Section>

          <Section title="5. Uso permitido">
            Você se compromete a usar a plataforma de forma legal, respeitosa e honesta. Não é
            permitido publicar conteúdo falso, ofensivo, ilegal, fraudulento, duplicado de forma
            abusiva, que viole direitos de terceiros ou que prejudique o funcionamento do app.
          </Section>

          <Section title="6. Planos, limites e recursos pagos">
            O app pode oferecer planos gratuitos e pagos, com limites e benefícios diferentes. Os
            valores, benefícios e regras de cada plano podem ser alterados mediante atualização da
            plataforma. Recursos pagos podem depender de meios de pagamento externos.
          </Section>

          <Section title="7. Notificações, localização e permissões">
            Algumas funções usam notificações, câmera, galeria e localização para melhorar a
            experiência, exibir materiais próximos e avisar sobre oportunidades compatíveis. Você pode
            gerenciar permissões nas configurações do seu dispositivo.
          </Section>

          <Section title="8. Suspensão ou encerramento">
            Podemos suspender, limitar ou remover contas, anúncios, pedidos ou conteúdos que violem
            estes termos, prejudiquem outros usuários, apresentem risco de fraude ou contrariem o uso
            adequado da plataforma.
          </Section>

          <Section title="9. Propriedade intelectual">
            A marca, identidade visual, textos, layout e recursos do SOS Marceneiros pertencem aos
            seus respectivos titulares. Você mantém responsabilidade sobre os conteúdos que publicar,
            como fotos, descrições e informações comerciais.
          </Section>

          <Section title="10. Alterações nos termos">
            Estes termos podem ser atualizados para refletir melhorias no app, mudanças legais ou
            novas funcionalidades. A versão mais recente ficará disponível nesta página.
          </Section>

          <Section title="11. Contato">
            Para dúvidas sobre estes Termos de Uso, entre em contato pelo e-mail{" "}
            <a className="font-bold text-primary underline" href="mailto:sosmarceneiroapp@gmail.com">
              sosmarceneiroapp@gmail.com
            </a>
            .
          </Section>
        </div>

        <footer className="mt-10 border-t border-[#e2daca] pt-5 text-sm">
          <Link to="/privacidade" className="font-bold text-primary underline">
            Ver Política de Privacidade
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
