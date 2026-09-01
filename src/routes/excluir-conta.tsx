import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/excluir-conta")({
  component: DeleteAccountPage,
});

const deletionEmail =
  "mailto:sosmarceneiroapp@gmail.com?subject=Solicita%C3%A7%C3%A3o%20de%20exclus%C3%A3o%20de%20conta%20-%20SOS%20Marceneiros";

function DeleteAccountPage() {
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
          <h1 className="mt-6 text-3xl font-black">Exclusão de conta e dados</h1>
          <p className="mt-3 leading-7 text-[#4b5563]">
            Esta página permite que usuários do aplicativo SOS Marceneiros solicitem a exclusão da
            conta e dos dados associados.
          </p>
        </header>

        <div className="mt-8 space-y-7 text-sm leading-7 text-[#374151]">
          <section>
            <h2 className="text-base font-black text-[#111827]">Como solicitar</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Use o botão abaixo para enviar um e-mail a partir do endereço da sua conta.</li>
              <li>Informe o nome da empresa e o e-mail usado no cadastro.</li>
              <li>
                Escreva que deseja excluir permanentemente sua conta e os dados vinculados a ela.
              </li>
            </ol>
            <a
              href={deletionEmail}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white"
            >
              <Mail className="h-4 w-4" /> Solicitar exclusão da conta
            </a>
            <p className="mt-3">
              Se o botão não abrir seu aplicativo de e-mail, envie a solicitação para{" "}
              <a
                className="font-bold text-primary underline"
                href="mailto:sosmarceneiroapp@gmail.com"
              >
                sosmarceneiroapp@gmail.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#111827]">Dados que serão excluídos</h2>
            <p className="mt-2">
              Após a confirmação da identidade do solicitante, serão excluídos a conta de acesso,
              o perfil e os dados da empresa, anúncios, pedidos, imagens enviadas, preferências,
              notificações e demais dados diretamente vinculados à conta, quando aplicável.
            </p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#111827]">Dados que podem ser mantidos</h2>
            <p className="mt-2">
              Alguns registros podem ser mantidos somente pelo período necessário para cumprir
              obrigações legais, fiscais, de segurança, prevenção a fraude ou resolução de
              disputas. Dados anonimizados, que não permitem identificar o usuário, também podem
              ser preservados.
            </p>
          </section>

          <section>
            <h2 className="text-base font-black text-[#111827]">Prazo</h2>
            <p className="mt-2">
              A solicitação será analisada e concluída em até 30 dias, salvo quando houver uma
              obrigação legal que exija prazo diferente. Podemos entrar em contato para confirmar a
              identidade e evitar a exclusão indevida de uma conta.
            </p>
          </section>
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
